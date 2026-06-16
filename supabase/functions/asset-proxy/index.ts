import { corsHeaders } from '../_shared/cors.ts'
import { getGitHubToken } from '../_shared/github.ts'

// This function returns raw binary content (images, etc.) from GitHub
// Called via GET with query params so <img src="..."> can use it directly
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    // Support both GET (query params) and POST (body)
    let owner: string, repo: string, branch: string, path: string

    if (req.method === 'GET') {
      const url = new URL(req.url)
      owner = url.searchParams.get('owner') || ''
      repo = url.searchParams.get('repo') || ''
      branch = url.searchParams.get('branch') || 'main'
      path = url.searchParams.get('path') || ''
    } else {
      const body = await req.json().catch(() => ({}))
      owner = body.owner || ''
      repo = body.repo || ''
      branch = body.branch || 'main'
      path = body.path || ''
    }

    if (!owner || !repo || !path) {
      return new Response(JSON.stringify({ error: 'owner, repo, and path are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { token } = await getGitHubToken(authHeader)

    // Fetch raw content from GitHub using the raw media type
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3.raw',
          'User-Agent': 'Cotext-App',
        },
      }
    )

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `GitHub ${res.status}` }), {
        status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Determine content type from file extension
    const ext = path.split('.').pop()?.toLowerCase() || ''
    const mimeTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf',
    }
    const contentType = mimeTypes[ext] || 'application/octet-stream'

    const blob = await res.blob()
    return new Response(blob, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
