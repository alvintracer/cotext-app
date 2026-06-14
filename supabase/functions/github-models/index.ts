import { corsHeaders } from '../_shared/cors.ts'

// GitHub Models inference proxy.
// Why a proxy: the models.github.ai inference endpoint is server-oriented (browser CORS not
// guaranteed) and requires the `X-GitHub-Api-Version` header. The user's GitHub LOGIN token
// (OAuth App) does NOT carry `models:read`, so we use a user-supplied fine-grained PAT (BYOK)
// passed in the request body and forward server-side.

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Light auth gate: require a Supabase session header (functions.invoke sets it).
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    const body = await req.json().catch(() => ({}))
    const { model, messages, token, max_tokens = 4096 } = body

    if (!token) return json({ error: 'GitHub Models PAT (token) is required' }, 400)
    if (!model || !Array.isArray(messages)) {
      return json({ error: 'model and messages[] are required' }, 400)
    }

    const res = await fetch('https://models.github.ai/inference/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2026-03-10',
      },
      body: JSON.stringify({ model, messages, max_tokens }),
    })

    const text = await res.text()
    // Pass through GitHub's response (JSON: choices[0].message.content, or error)
    return new Response(text, {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
