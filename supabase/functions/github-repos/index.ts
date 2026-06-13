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
    const { action } = body

    if (action === 'create') {
      const { name, description = '', private: isPrivate = true } = body
      if (!name) {
        return new Response(JSON.stringify({ error: 'name is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const data = await githubFetch(token, '/user/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, private: isPrivate, auto_init: true }),
      })

      return new Response(JSON.stringify({ repo: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Default: list repos
    const data = await githubFetch(token, '/user/repos?sort=updated&per_page=50')
    const repos = data.map((r: any) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      owner: r.owner.login,
      private: r.private,
      default_branch: r.default_branch,
      description: r.description,
    }))

    return new Response(JSON.stringify({ repos }), {
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
