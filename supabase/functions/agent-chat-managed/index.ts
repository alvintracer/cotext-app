import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { runChat } from '../../../src/lib/agent/providers.ts'
import { getProvider, type ProviderId, type TokenUsage } from '../../../src/lib/agent/models.ts'

interface ChargeRow {
  transaction_id: string
  balance_credits: number
  reserved_credits: number
  lifetime_used_credits: number
  monthly_grant_credits: number
  billing_state: string
  updated_at: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
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

function estimateCredits(system: string, messages: ChatMessage[]) {
  const requestChars = system.length + messages.reduce((sum, message) => sum + (message.content?.length || 0), 0)
  return {
    requestChars,
    chargedCredits: Math.max(1, Math.ceil(requestChars / 12000)),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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
    return json({ error: 'Managed agent is not configured on the server' }, 503)
  }

  const body = await req.json().catch(() => ({}))
  const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : ''
  const system = typeof body.system === 'string' ? body.system : ''
  const messages = Array.isArray(body.messages)
    ? body.messages
      .filter((item): item is ChatMessage => {
        return item
          && (item.role === 'user' || item.role === 'assistant')
          && typeof item.content === 'string'
      })
    : []

  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400)
  if (!system.trim()) return json({ error: 'system is required' }, 400)
  if (!messages.length) return json({ error: 'messages[] is required' }, 400)

  const { requestChars, chargedCredits } = estimateCredits(system, messages)

  const { data: balanceRow, error: balanceError } = await admin
    .from('managed_credit_balances')
    .select('balance_credits')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (balanceError) {
    console.error('[agent-chat-managed] Failed to read balance:', balanceError.message)
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

  try {
    let usage: TokenUsage | undefined
    const text = await runChat({
      shape: provider.shape,
      baseURL: provider.baseURL,
      apiKey,
      model,
      system,
      messages,
      onUsage: (nextUsage) => {
        usage = nextUsage
      },
    })

    let chargeRow: ChargeRow | null = null
    let chargeError: string | null = null
    try {
      const { data, error } = await admin.rpc('apply_managed_credit_usage', {
        p_workspace_id: workspaceId,
        p_user_id: user.id,
        p_delta_credits: -chargedCredits,
        p_kind: 'managed_agent_chat',
        p_note: `Cotext managed agent chat (${requestChars} chars)`,
        p_metadata: {
          providerId,
          model,
          requestChars,
          messageCount: messages.length,
          usage,
        },
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      chargeRow = row as ChargeRow | null
    } catch (err) {
      chargeError = err instanceof Error ? err.message : 'Credit charge failed'
      console.error('[agent-chat-managed] Credit charge failed:', chargeError)
    }

    return json({
      ok: true,
      managed: {
        providerId,
        model,
        billingMode: 'beta',
        requestChars,
        chargedCredits,
        chargeSkipped: !chargeRow,
        chargeError,
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
      usage,
      text,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[agent-chat-managed] Error:', message)
    return json({ error: message }, 500)
  }
})
