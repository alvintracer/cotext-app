import { corsHeaders } from '../_shared/cors.ts'
import { getGitHubToken, githubFetch } from '../_shared/github.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { token } = await getGitHubToken(authHeader)
    const body = await req.json().catch(() => ({}))
    const { owner, repo, branch = 'main', path } = body

    if (!owner || !repo || !path) {
      return new Response(JSON.stringify({ error: 'owner, repo, and path are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await githubFetch(token, `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`)

    // Decode base64 content
    const content = data.content ? atob(data.content.replace(/\n/g, '')) : ''

    return new Response(JSON.stringify({ content, sha: data.sha }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // 404 = file doesn't exist yet, return empty
    if (message.includes('404')) {
      return new Response(JSON.stringify({ content: '', sha: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const status = message === 'Unauthorized' ? 401 : 500
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
