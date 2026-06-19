import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateKnowledgeGraphLLM, type LlmExtractSource } from '../../../src/lib/knowledge/llmExtract.ts'
import { getProvider, type ProviderId } from '../../../src/lib/agent/models.ts'

interface ChargeRow {
  transaction_id: string
  balance_credits: number
  reserved_credits: number
  lifetime_used_credits: number
  monthly_grant_credits: number
  billing_state: string
  updated_at: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function readManagedProvider(): ProviderId {
  const raw = (
    Deno.env.get('MANAGED_LLM_PROVIDER')
    || Deno.env.get('managed_llm_provider')
    || 'xai'
  ).trim()
  if (raw === 'gemini' || raw === 'openai' || raw === 'anthropic' || raw === 'xai') return raw
  return 'xai'
}

function estimateCredits(sources: LlmExtractSource[]): { requestChars: number; chargedCredits: number } {
  const requestChars = sources.reduce((sum, source) => sum + (source.text?.length || 0), 0)
  return {
    requestChars,
    chargedCredits: Math.max(1, Math.ceil(requestChars / 12000)),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── Pre-flight: auth, balance, parse body ──────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: { user }, error: authErr } = await db.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const providerId = readManagedProvider()
  const provider = getProvider(providerId)
  const model = (
    Deno.env.get('MANAGED_LLM_MODEL')
    || Deno.env.get('managed_llm_model')
    || provider.defaultModel
  ).trim()
  const apiKey = (
    Deno.env.get('MANAGED_LLM_API_KEY')
    || Deno.env.get('managed_llm_api_key')
    || Deno.env.get('MANAGED_API_KEY')
    || Deno.env.get('managed_api_key')
    || ''
  ).trim()
  if (!apiKey) {
    return json({ error: 'Managed extraction is not configured on the server' }, 503)
  }

  const body = await req.json().catch(() => ({}))
  const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : ''
  const sources = Array.isArray(body.sources) ? body.sources as LlmExtractSource[] : []
  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400)
  if (!sources.length) return json({ error: 'sources[] is required' }, 400)

  const { requestChars, chargedCredits } = estimateCredits(sources)

  const { data: balanceRow, error: balanceError } = await admin
    .from('managed_credit_balances')
    .select('balance_credits')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (balanceError) {
    console.error('[neural-extract-managed] Failed to read balance:', balanceError.message)
  }
  const currentBalance = Number(balanceRow?.balance_credits ?? 100)
  if (currentBalance < chargedCredits) {
    return json({
      error: 'Insufficient managed credits',
      managed: {
        providerId, model, billingMode: 'beta', requestChars, chargedCredits,
        balance: {
          balanceCredits: currentBalance, reservedCredits: 0,
          lifetimeUsedCredits: 0, monthlyGrantCredits: 100,
          billingState: 'beta', updatedAt: new Date().toISOString(), transactionId: null,
        },
      },
    }, 402)
  }

  // ── SSE streaming response ────────────────────────────────
  // Keeps the connection alive by sending progress events during
  // long-running LLM extraction, preventing Supabase Edge Function
  // timeout (150s free / 400s pro).
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        send('progress', { phase: 'extracting', current: 0, total: 1, message: 'Starting extraction...' })

        const result = await generateKnowledgeGraphLLM(sources, {
          providerId, model, apiKey,
        }, {
          onProgress: (info) => {
            send('progress', info)
          },
          onChunkResult: (chunkIndex, totalChunks, _payload, error) => {
            send('chunk', { chunkIndex, totalChunks, error: error || null })
          },
        })

        // Charge credits
        let chargeRow: ChargeRow | null = null
        let chargeError: string | null = null
        try {
          const { data, error } = await admin.rpc('apply_managed_credit_usage', {
            p_workspace_id: workspaceId,
            p_user_id: user.id,
            p_delta_credits: -chargedCredits,
            p_kind: 'managed_extract',
            p_note: `MindSync managed extraction (${sources.length} source(s), ${requestChars} chars)`,
            p_metadata: {
              providerId, model, sourceCount: sources.length, requestChars,
              sectionCount: result.sectionCount, chunksProcessed: result.chunksProcessed,
              chunksFailed: result.chunksFailed,
            },
          })
          if (error) throw error
          const row = Array.isArray(data) ? data[0] : data
          chargeRow = row as ChargeRow | null
        } catch (err) {
          chargeError = err instanceof Error ? err.message : 'Credit charge failed'
          console.error('[neural-extract-managed] Credit charge failed:', chargeError)
        }

        send('done', {
          ok: true,
          managed: {
            providerId, model, billingMode: 'beta', requestChars, chargedCredits,
            chargeSkipped: !chargeRow, chargeError,
            balance: chargeRow ? {
              balanceCredits: Number(chargeRow.balance_credits ?? 0),
              reservedCredits: Number(chargeRow.reserved_credits ?? 0),
              lifetimeUsedCredits: Number(chargeRow.lifetime_used_credits ?? 0),
              monthlyGrantCredits: Number(chargeRow.monthly_grant_credits ?? 0),
              billingState: chargeRow.billing_state,
              updatedAt: chargeRow.updated_at,
              transactionId: chargeRow.transaction_id,
            } : null,
          },
          result,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[neural-extract-managed] Error:', message)
        send('error', { error: message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})
