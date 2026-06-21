import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getManagedCreditPack } from '../../../src/lib/billing/packs.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function readApiKey(): string {
  return (
    Deno.env.get('NOWPAYMENTS_API_KEY')
    || Deno.env.get('nowpayments_api_key')
    || ''
  ).trim()
}

function readBaseUrl(): string {
  return (
    Deno.env.get('NOWPAYMENTS_API_BASE')
    || Deno.env.get('nowpayments_api_base')
    || 'https://api.nowpayments.io'
  ).replace(/\/$/, '')
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
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

  const apiKey = readApiKey()
  if (!apiKey) return json({ error: 'NOWPayments is not configured on the server' }, 503)

  const body = await req.json().catch(() => ({}))
  const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : ''
  const packId = typeof body.pack_id === 'string' ? body.pack_id.trim() : ''
  const successUrl = isHttpUrl(body.success_url) ? body.success_url : null
  const cancelUrl = isHttpUrl(body.cancel_url) ? body.cancel_url : null

  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400)
  if (!packId) return json({ error: 'pack_id is required' }, 400)

  const pack = getManagedCreditPack(packId)
  if (!pack) return json({ error: 'Unknown credit pack' }, 400)

  const { data: workspace, error: workspaceError } = await db
    .from('workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .maybeSingle()
  if (workspaceError) return json({ error: workspaceError.message }, 400)
  if (!workspace) return json({ error: 'Workspace not found or access denied' }, 404)

  const orderId = `ctx_${workspaceId.slice(0, 8)}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  const callbackUrl = `${Deno.env.get('SUPABASE_URL')!}/functions/v1/nowpayments-ipn`
  const orderDescription = `${workspace.name} managed credits (${pack.credits})`

  const upstream = await fetch(`${readBaseUrl()}/v1/invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      price_amount: pack.priceAmount,
      price_currency: pack.priceCurrency,
      order_id: orderId,
      order_description: orderDescription,
      ipn_callback_url: callbackUrl,
      success_url: successUrl,
      cancel_url: cancelUrl,
      is_fixed_rate: true,
      is_fee_paid_by_user: false,
    }),
  })

  const text = await upstream.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  if (!upstream.ok) {
    return json({
      error: typeof data.message === 'string' ? data.message : `NOWPayments invoice request failed (${upstream.status})`,
      details: data,
    }, 502)
  }

  const providerInvoiceId = typeof data.id === 'string' || typeof data.id === 'number' ? String(data.id) : null
  const invoiceUrl = typeof data.invoice_url === 'string' ? data.invoice_url : ''
  if (!providerInvoiceId || !invoiceUrl) {
    return json({ error: 'NOWPayments invoice response was incomplete', details: data }, 502)
  }

  const { error: insertError } = await admin
    .from('managed_credit_orders')
    .insert({
      provider: 'nowpayments',
      provider_order_id: orderId,
      workspace_id: workspaceId,
      user_id: user.id,
      pack_id: pack.id,
      credits: pack.credits,
      price_amount: pack.priceAmount,
      price_currency: pack.priceCurrency,
      provider_invoice_id: providerInvoiceId,
      invoice_url: invoiceUrl,
      status: 'waiting',
      metadata: {
        provider: 'nowpayments',
        provider_response: data,
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
    })
  if (insertError) {
    return json({ error: insertError.message }, 500)
  }

  return json({
    ok: true,
    orderId,
    invoiceId: providerInvoiceId,
    invoiceUrl,
    status: 'waiting',
    credits: pack.credits,
    priceAmount: pack.priceAmount,
    priceCurrency: pack.priceCurrency,
    packId: pack.id,
  })
})
