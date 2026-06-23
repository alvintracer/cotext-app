// wiki-synthesize-managed — server-side equivalent of synthesizeWikiDocs() for
// users who pick "Cotext Model" instead of BYOK. Same prompt + sanitize logic,
// runs with the platform's managed LLM key, debits credits from
// `managed_credit_balances` via the apply_managed_credit_usage RPC.
//
// Pattern mirrors neural-extract-managed. Single LLM call (no chunking) — wiki
// synthesis ingests at most ~16K chars of room content per request.

import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { synthesizeWikiDocs, type WikiProposal } from '../../../src/lib/knowledge/wikiSynthesize.ts'
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

function estimateCredits(roomContent: string): { requestChars: number; chargedCredits: number } {
  const requestChars = roomContent.length
  return { requestChars, chargedCredits: Math.max(1, Math.ceil(requestChars / 12000)) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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
    || ''
  ).trim()
  if (!apiKey) return json({ error: 'Managed wiki synthesis is not configured on the server' }, 503)

  const body = await req.json().catch(() => ({}))
  const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : ''
  const roomContent = typeof body.room_content === 'string' ? body.room_content : ''
  const existingIndex = typeof body.existing_index === 'string' ? body.existing_index : undefined
  const repoLabel = typeof body.repo_label === 'string' ? body.repo_label : 'workspace'
  const roomLabel = typeof body.room_label === 'string' ? body.room_label : 'room'
  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400)
  if (!roomContent.trim()) return json({ error: 'room_content is required' }, 400)

  const { requestChars, chargedCredits } = estimateCredits(roomContent)

  // Balance check (RLS gives the user their own workspace's balance via admin client guarded above).
  const { data: balanceRow } = await admin
    .from('managed_credit_balances')
    .select('balance_credits')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
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

  let proposals: WikiProposal[] = []
  try {
    proposals = await synthesizeWikiDocs({
      providerId, model, apiKey,
      roomContent, existingIndex,
      repoLabel, roomLabel,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Synthesis failed'
    console.error('[wiki-synthesize-managed] LLM call failed:', msg)
    return json({ error: msg }, 500)
  }

  // Charge credits (same RPC the extract path uses — single charge per call).
  let chargeRow: ChargeRow | null = null
  let chargeError: string | null = null
  try {
    const { data, error } = await admin.rpc('apply_managed_credit_usage', {
      p_workspace_id: workspaceId,
      p_user_id: user.id,
      p_delta_credits: -chargedCredits,
      p_kind: 'wiki_synthesize',
      p_note: `MindSync wiki synthesis (${proposals.length} doc(s), ${requestChars} chars)`,
      p_metadata: { providerId, model, requestChars, docCount: proposals.length },
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    chargeRow = row as ChargeRow | null
  } catch (err) {
    chargeError = err instanceof Error ? err.message : 'Credit charge failed'
    console.error('[wiki-synthesize-managed] Credit charge failed:', chargeError)
  }

  return json({
    ok: true,
    proposals,
    managed: {
      providerId, model, billingMode: 'beta', requestChars, chargedCredits,
      chargeSkipped: !chargeRow, chargeError,
      balance: chargeRow ? {
        balanceCredits: Number(chargeRow.balance_credits ?? 0),
        reservedCredits: Number(chargeRow.reserved_credits ?? 0),
        lifetimeUsedCredits: Number(chargeRow.lifetime_used_credits ?? 0),
        monthlyGrantCredits: Number(chargeRow.monthly_grant_credits ?? 0),
        billingState: String(chargeRow.billing_state),
        updatedAt: String(chargeRow.updated_at),
        transactionId: chargeRow.transaction_id,
      } : null,
    },
  })
})
