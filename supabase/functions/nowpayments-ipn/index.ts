import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function readIpnSecret(): string {
  return (
    Deno.env.get('NOWPAYMENTS_IPN_SECRET')
    || Deno.env.get('nowpayments_ipn_secret')
    || ''
  ).trim()
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function signPayload(secret: string, payload: Record<string, unknown>): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const encoded = new TextEncoder().encode(JSON.stringify(payload, Object.keys(payload).sort()))
  const signature = await crypto.subtle.sign('HMAC', key, encoded)
  return toHex(signature)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const ipnSecret = readIpnSecret()
  if (!ipnSecret) return json({ error: 'NOWPayments IPN secret is not configured' }, 503)

  const signature = req.headers.get('x-nowpayments-sig')?.trim() || ''
  if (!signature) return json({ error: 'Missing NOWPayments signature' }, 401)

  const raw = await req.text()
  if (!raw) return json({ error: 'Empty body' }, 400)

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const expected = await signPayload(ipnSecret, payload)
  if (expected !== signature) {
    return json({ error: 'Invalid NOWPayments signature' }, 401)
  }

  const providerOrderId = typeof payload.order_id === 'string' ? payload.order_id : ''
  const providerPaymentId = payload.payment_id === undefined || payload.payment_id === null
    ? null
    : String(payload.payment_id)
  const providerInvoiceId = payload.invoice_id === undefined || payload.invoice_id === null
    ? null
    : String(payload.invoice_id)
  const status = typeof payload.payment_status === 'string' ? payload.payment_status : 'pending'
  if (!providerOrderId) return json({ error: 'Missing order_id in IPN payload' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error } = await admin.rpc('apply_nowpayments_credit_order', {
    p_provider_order_id: providerOrderId,
    p_provider_payment_id: providerPaymentId,
    p_provider_invoice_id: providerInvoiceId,
    p_status: status,
    p_payload: payload,
  })
  if (error) {
    console.error('[nowpayments-ipn] apply order failed:', error.message)
    return json({ error: error.message }, 500)
  }

  return json({
    ok: true,
    orderId: providerOrderId,
    paymentId: providerPaymentId,
    invoiceId: providerInvoiceId,
    status,
    result: Array.isArray(data) ? data[0] : data,
  })
})
