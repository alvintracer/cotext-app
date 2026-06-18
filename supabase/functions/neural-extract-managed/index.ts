import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateKnowledgeGraphLLM, type LlmExtractSource } from '../../../src/lib/knowledge/llmExtract.ts'
import { getProvider, type ProviderId } from '../../../src/lib/agent/models.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
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
    const sources = Array.isArray(body.sources) ? body.sources as LlmExtractSource[] : []
    if (!sources.length) return json({ error: 'sources[] is required' }, 400)

    const result = await generateKnowledgeGraphLLM(sources, {
      providerId,
      model,
      apiKey,
    })

    return json({
      ok: true,
      managed: {
        providerId,
        model,
        billingMode: 'beta-unmetered',
      },
      result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[neural-extract-managed] Error:', message)
    return json({ error: message }, 500)
  }
})
