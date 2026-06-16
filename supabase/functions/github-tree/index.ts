import { corsHeaders } from '../_shared/cors.ts'
import { getWorkspaceGitHubToken } from '../_shared/github.ts'

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

    const body = await req.json().catch(() => ({}))
    const { owner, repo, branch = 'main', path = '' } = body

    if (!owner || !repo) {
      return new Response(JSON.stringify({ error: 'owner and repo are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { token } = await getWorkspaceGitHubToken(authHeader, owner, repo)

    // Read-only: skip repo creation for invited users

    const treePath = path ? `/${path}` : ''
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents${treePath}?ref=${branch}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Cotext-App',
        },
      }
    )

    // 404 = empty repo or path doesn't exist
    if (res.status === 404) {
      return new Response(JSON.stringify({ tree: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`GitHub API error ${res.status}: ${errBody}`)
    }

    const data = await res.json()
    const items = Array.isArray(data) ? data : [data]
    const tree = items.map((item: any) => ({
      name: item.name,
      path: item.path,
      type: item.type,
      size: item.size || 0,
      sha: item.sha,
    }))

    return new Response(JSON.stringify({ tree }), {
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
