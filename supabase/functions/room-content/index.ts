import { corsHeaders } from '../_shared/cors.ts'
import { getGitHubToken, ensureRepoExists } from '../_shared/github.ts'

// Decode base64 to UTF-8 string (handles Korean/Unicode properly)
function base64ToUtf8(base64: string): string {
  const binString = atob(base64)
  const bytes = Uint8Array.from(binString, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

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
    const { owner, repo, branch = 'main', path, raw = false } = body

    if (!owner || !repo || !path) {
      return new Response(JSON.stringify({ error: 'owner, repo, and path are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Ensure repo exists
    await ensureRepoExists(token, owner, repo)

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Cotext-App',
        },
      }
    )

    // 404 = file doesn't exist yet, return empty
    if (res.status === 404) {
      return new Response(JSON.stringify({ content: '', sha: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`GitHub API error ${res.status}: ${errBody}`)
    }

    const data = await res.json()
    const rawBase64 = data.content ? data.content.replace(/\n/g, '') : ''

    // Raw mode: return base64 as-is (for binary files like images)
    if (raw) {
      return new Response(JSON.stringify({ base64: rawBase64, sha: data.sha }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Text mode: decode base64 to UTF-8 string
    let content = ''
    if (rawBase64) {
      try {
        content = base64ToUtf8(rawBase64)
      } catch (e) {
        console.error('[room-content] base64 decode error:', e)
        content = atob(rawBase64)
      }
    }

    return new Response(JSON.stringify({ content, sha: data.sha }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[room-content] Error:', message)
    const status = message === 'Unauthorized' ? 401 : 500
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
