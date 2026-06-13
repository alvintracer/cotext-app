import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    const format = url.searchParams.get('format') || 'markdown' // 'markdown' or 'json'

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token parameter' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate token using RPC (no auth needed — security definer)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: linkData, error: linkError } = await supabase
      .rpc('validate_shared_link', { p_token: token })

    if (linkError || !linkData?.valid) {
      const errorMsg = linkData?.error || linkError?.message || 'Invalid link'
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { owner, repo, branch, room_path, source_filter, user_id, label } = linkData

    // Get GitHub token for the link creator
    const { data: conn } = await supabase
      .from('github_connections')
      .select('access_token_encrypted')
      .eq('user_id', user_id)
      .maybeSingle()

    if (!conn?.access_token_encrypted) {
      return new Response(JSON.stringify({ error: 'GitHub connection lost for link owner' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const ghToken = conn.access_token_encrypted

    // Fetch content from GitHub
    let content = ''
    if (room_path) {
      // Single room
      const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${room_path}?ref=${branch}`, {
        headers: {
          'Authorization': `Bearer ${ghToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Cotext-App',
        },
      })

      if (!ghRes.ok) {
        return new Response(JSON.stringify({ error: `GitHub: ${ghRes.status}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const ghData = await ghRes.json()
      const raw = atob(ghData.content.replace(/\n/g, ''))
      content = new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0)))
    } else {
      // All rooms: fetch INDEX.md if exists
      try {
        const idxRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/.cotext/INDEX.md?ref=${branch}`, {
          headers: {
            'Authorization': `Bearer ${ghToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Cotext-App',
          },
        })
        if (idxRes.ok) {
          const idxData = await idxRes.json()
          const raw = atob(idxData.content.replace(/\n/g, ''))
          content = new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0)))
        }
      } catch { /* no index */ }
    }

    // Apply source filter
    if (source_filter === 'me') {
      const lines = content.split('\n')
      const blocks: Array<{ header: string; source?: string; lines: string[] }> = []
      let headerLines: string[] = []
      let current: { header: string; source?: string; lines: string[] } | null = null

      for (const line of lines) {
        const tsMatch = line.match(/^## \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
        if (tsMatch) {
          if (current) blocks.push(current)
          current = { header: line, lines: [] }
        } else if (current) {
          const srcMatch = line.match(/^<!-- source: (\w+) -->/)
          if (srcMatch && !current.source) {
            current.source = srcMatch[1]
          }
          current.lines.push(line)
        } else {
          headerLines.push(line)
        }
      }
      if (current) blocks.push(current)

      const meBlocks = blocks.filter(b => !b.source || b.source === 'me')
      content = headerLines.join('\n') + '\n' +
        meBlocks.map(b => b.header + '\n' + b.lines.join('\n')).join('\n')
    }

    const now = new Date().toISOString().split('T')[0]
    const titlePart = label || `${owner}/${repo}${room_path ? '/' + room_path.replace(/\/.cotext\/cotext\.md$/, '') : ''}`

    if (format === 'json') {
      return new Response(JSON.stringify({
        title: titlePart,
        owner, repo, branch,
        room_path: room_path || null,
        source_filter,
        generated: now,
        content,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Markdown format (default)
    const pack = `# Context Pack — ${titlePart}\n\n> Generated: ${now}\n> Source filter: ${source_filter}\n\n---\n\n${content}`
    return new Response(pack, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/markdown; charset=utf-8',
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[context-share] Error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
