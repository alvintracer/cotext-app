import { corsHeaders } from '../_shared/cors.ts'
import { getGitHubToken, ensureRepoExists } from '../_shared/github.ts'

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

    // Ensure repo exists (auto-create if not)
    await ensureRepoExists(token, owner, repo)

    // Base64 encode the content
    const encoded = btoa(unescape(encodeURIComponent(content)))

    const payload: any = {
      message: message || `Update ${path}`,
      content: encoded,
      branch,
    }

    if (sha) {
      payload.sha = sha
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Cotext-App',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error(`[room-push] GitHub PUT failed: ${res.status}`, errBody)

      // 409 = SHA conflict (file was modified by someone else)
      if (res.status === 409) {
        return new Response(JSON.stringify({
          error: 'Conflict: file was modified on GitHub. Pull first to get the latest version.',
          code: 'CONFLICT',
        }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // 422 = SHA mismatch (stale sha)
      if (res.status === 422) {
        return new Response(JSON.stringify({
          error: 'SHA mismatch. The file has changed on GitHub. Pull the latest version first.',
          code: 'SHA_MISMATCH',
        }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ error: `GitHub API error ${res.status}: ${errBody}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await res.json()

    return new Response(JSON.stringify({
      sha: data.content?.sha,
      commit: data.commit?.sha,
      message: 'Pushed successfully',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[room-push] Error:', msg)
    const status = msg === 'Unauthorized' ? 401 : 500
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
