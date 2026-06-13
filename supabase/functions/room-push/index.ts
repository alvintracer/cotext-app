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
    const { owner, repo, branch = 'main', path, content, message, sha } = body

    if (!owner || !repo || !path || content === undefined) {
      return new Response(JSON.stringify({ error: 'owner, repo, path, and content are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Base64 encode the content
    const encoded = btoa(unescape(encodeURIComponent(content)))

    const payload: any = {
      message: message || `Update ${path}`,
      content: encoded,
      branch,
    }

    // If sha is provided, it's an update (not a new file)
    if (sha) {
      payload.sha = sha
    }

    const data = await githubFetch(token, `/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    return new Response(JSON.stringify({
      sha: data.content?.sha,
      commit: data.commit?.sha,
      message: 'Pushed successfully',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Unauthorized' ? 401 : 500
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
