import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface Block {
  timestamp: string
  source?: string
  content: string
}

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = []
  const lines = content.split('\n')
  let current: Block | null = null
  for (const line of lines) {
    const tsMatch = line.match(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/)
    const srcMatch = line.match(/^<!-- source: (\w+) -->/)
    if (tsMatch) {
      if (current) blocks.push(current)
      current = { timestamp: tsMatch[1], content: '' }
    } else if (srcMatch && current && !current.source) {
      current.source = srcMatch[1]
    } else if (current) {
      current.content += line + '\n'
    }
  }
  if (current) blocks.push(current)
  return blocks
}

async function validateKey(req: Request): Promise<{ error?: string; owner?: string; repo?: string; branch?: string; userId?: string; workspaceId?: string; scopes?: string[] }> {
  const auth = req.headers.get('authorization') || ''
  const key = auth.replace(/^Bearer\s+/i, '').trim()
  if (!key || !key.startsWith('ctx_')) {
    return { error: 'Missing or invalid API key. Use: Authorization: Bearer ctx_xxx' }
  }
  const { data, error } = await supabase.rpc('validate_api_key', { p_key: key })
  if (error || !data?.valid) {
    return { error: data?.error || 'Invalid API key' }
  }
  return { owner: data.owner, repo: data.repo, branch: data.branch, userId: data.user_id, workspaceId: data.workspace_id, scopes: data.scopes }
}

async function getGhToken(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('github_connections')
    .select('access_token_encrypted')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.access_token_encrypted || null
}

async function ghFetch(token: string, path: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Cotext-App',
    },
  })
}

async function ghGetContent(token: string, owner: string, repo: string, branch: string, filePath: string): Promise<string | null> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`)
  if (!res.ok) return null
  const data = await res.json()
  const raw = atob(data.content.replace(/\n/g, ''))
  return new TextDecoder().decode(Uint8Array.from(raw, (c: string) => c.charCodeAt(0)))
}

async function ghPutContent(token: string, owner: string, repo: string, branch: string, filePath: string, content: string, message: string, sha?: string): Promise<boolean> {
  const body: Record<string, unknown> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch,
  }
  if (sha) body.sha = sha
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Cotext-App',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return res.ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/context-api\/?/, '').replace(/\/$/, '')
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  // Validate API key
  const auth = await validateKey(req)
  if (auth.error) return json({ error: auth.error }, 401)

  const { owner, repo, branch, userId, workspaceId, scopes } = auth as { owner: string; repo: string; branch: string; userId: string; workspaceId: string; scopes: string[] }
  const ghToken = await getGhToken(userId)
  if (!ghToken) return json({ error: 'GitHub connection lost' }, 500)

  try {
    // GET /tools — list available tools
    if (path === 'tools' && req.method === 'GET') {
      return json({
        tools: [
          { name: 'list_rooms', method: 'GET', path: '/rooms', description: 'List all Cotext rooms' },
          { name: 'get_room', method: 'GET', path: '/rooms/:path', description: 'Get room content' },
          { name: 'search', method: 'GET', path: '/search?q=...&source=...', description: 'Search across rooms' },
          { name: 'get_pack', method: 'GET', path: '/pack/:path?source=me', description: 'Get Context Pack' },
          { name: 'append', method: 'POST', path: '/rooms/:path/append', description: 'Append a block' },
          { name: 'get_neural_graph', method: 'GET', path: '/neural/graph?format=summary|json|markdown', description: 'Neural Link graph snapshot' },
          { name: 'find_related', method: 'GET', path: '/neural/find_related?node_id=...', description: 'Related nodes (same-cluster + edges)' },
          { name: 'search_clusters', method: 'GET', path: '/neural/search_clusters?q=...', description: 'Search clusters by name/id' },
          { name: 'get_node_context', method: 'GET', path: '/neural/node?id=...', description: 'Node detail + block text + adjacent labels' },
        ],
        repo: `${owner}/${repo}`,
      })
    }

    // GET /rooms — list rooms
    if (path === 'rooms' && req.method === 'GET') {
      // Try to get INDEX.md
      const index = await ghGetContent(ghToken, owner, repo, branch, '.cotext/INDEX.md')
      if (index) {
        return json({ index, repo: `${owner}/${repo}` })
      }
      // Fallback: scan tree for .cotext/cotext.md files
      const treeRes = await ghFetch(ghToken, `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`)
      if (!treeRes.ok) return json({ error: 'Failed to fetch repo tree' }, 500)
      const tree = await treeRes.json()
      const rooms = tree.tree
        .filter((f: { path: string }) => f.path.endsWith('.cotext/cotext.md'))
        .map((f: { path: string }) => ({
          path: f.path.replace(/\/.cotext\/cotext\.md$/, '') || 'root',
          cotext_file: f.path,
        }))
      return json({ rooms, repo: `${owner}/${repo}` })
    }

    // GET /rooms/:path — get room content
    if (path.startsWith('rooms/') && !path.includes('/append') && req.method === 'GET') {
      const roomPath = decodeURIComponent(path.replace('rooms/', ''))
      const filePath = roomPath === 'root'
        ? '.cotext/cotext.md'
        : `${roomPath}/.cotext/cotext.md`
      const content = await ghGetContent(ghToken, owner, repo, branch, filePath)
      if (!content) return json({ error: `Room not found: ${roomPath}` }, 404)
      const blocks = parseBlocks(content)
      return json({
        room: roomPath,
        blocks: blocks.length,
        human_blocks: blocks.filter(b => !b.source || b.source === 'me').length,
        agent_blocks: blocks.filter(b => b.source && b.source !== 'me').length,
        content,
      })
    }

    // GET /search?q=...&source=...
    if (path === 'search' && req.method === 'GET') {
      const q = url.searchParams.get('q') || ''
      const sourceFilter = url.searchParams.get('source') || undefined
      if (!q) return json({ error: 'Missing q parameter' }, 400)

      // Get tree
      const treeRes = await ghFetch(ghToken, `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`)
      if (!treeRes.ok) return json({ error: 'Failed to fetch tree' }, 500)
      const tree = await treeRes.json()
      const cotextFiles = tree.tree.filter((f: { path: string }) => f.path.endsWith('.cotext/cotext.md'))

      const results: Array<{ room: string; timestamp: string; source?: string; snippet: string }> = []
      const qLower = q.toLowerCase()

      for (const f of cotextFiles.slice(0, 20)) { // limit to 20 rooms
        const content = await ghGetContent(ghToken, owner, repo, branch, f.path)
        if (!content) continue
        const roomPath = f.path.replace(/\/.cotext\/cotext\.md$/, '') || 'root'
        const blocks = parseBlocks(content)
        for (const block of blocks) {
          if (sourceFilter && block.source !== sourceFilter) continue
          if (block.content.toLowerCase().includes(qLower)) {
            results.push({
              room: roomPath,
              timestamp: block.timestamp,
              source: block.source,
              snippet: block.content.trim().substring(0, 200),
            })
          }
        }
      }
      return json({ query: q, results })
    }

    // GET /pack/:path?source=me
    if (path.startsWith('pack/') && req.method === 'GET') {
      const roomPath = decodeURIComponent(path.replace('pack/', ''))
      const sourceFilter = url.searchParams.get('source') || 'me'
      const filePath = roomPath === 'root'
        ? '.cotext/cotext.md'
        : `${roomPath}/.cotext/cotext.md`
      const content = await ghGetContent(ghToken, owner, repo, branch, filePath)
      if (!content) return json({ error: `Room not found: ${roomPath}` }, 404)

      const blocks = parseBlocks(content)
      const filtered = sourceFilter === 'all'
        ? blocks
        : blocks.filter(b => !b.source || b.source === 'me')

      const now = new Date().toISOString().split('T')[0]
      const blockTexts = filtered.map(b =>
        `## ${b.timestamp}\n<!-- source: ${b.source || 'me'} -->\n${b.content.trimEnd()}`
      ).join('\n\n')

      const filterNote = filtered.length < blocks.length
        ? `Filter: ${filtered.length}/${blocks.length} blocks (me-only)`
        : `Blocks: ${blocks.length} total`

      const pack = `# Context Pack \u2014 ${owner}/${repo}/${roomPath}\n\n> Generated: ${now}\n> ${filterNote}\n\n---\n\n${blockTexts}\n`

      return new Response(pack, {
        headers: { ...corsHeaders, 'Content-Type': 'text/markdown; charset=utf-8' }
      })
    }

    // POST /rooms/:path/append
    if (path.startsWith('rooms/') && path.endsWith('/append') && req.method === 'POST') {
      if (!scopes.includes('write')) return json({ error: 'API key does not have write scope' }, 403)

      const roomPath = decodeURIComponent(path.replace('rooms/', '').replace('/append', ''))
      const body = await req.json()
      const { content: blockContent, source = 'agent' } = body
      if (!blockContent) return json({ error: 'Missing content field' }, 400)

      const filePath = roomPath === 'root'
        ? '.cotext/cotext.md'
        : `${roomPath}/.cotext/cotext.md`

      // Get existing content and sha
      let existing = ''
      let sha: string | undefined
      const getRes = await ghFetch(ghToken, `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`)
      if (getRes.ok) {
        const data = await getRes.json()
        sha = data.sha
        const raw = atob(data.content.replace(/\n/g, ''))
        existing = new TextDecoder().decode(Uint8Array.from(raw, (c: string) => c.charCodeAt(0)))
      } else {
        existing = `# Cotext: ${roomPath}\n`
      }

      const now = new Date()
      const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
      const newBlock = `\n## ${ts}\n<!-- source: ${source} -->\n\n${blockContent}\n`
      const updated = existing.trimEnd() + '\n' + newBlock

      const ok = await ghPutContent(ghToken, owner, repo, branch, filePath, updated, `cotext: append block (${source})`, sha)
      if (!ok) return json({ error: 'Failed to write to GitHub' }, 500)

      return json({ ok: true, room: roomPath, source, timestamp: ts })
    }

    // ===== Neural Link (P5.2): workspace-scoped graph queries against the
    // Supabase derived index. service role + manual workspace_id filter, since
    // we're authenticated via api key (not user JWT). =====

    // GET /neural/graph?format=summary|json|markdown
    if (path === 'neural/graph' && req.method === 'GET') {
      const format = url.searchParams.get('format') || 'summary'
      const [{ data: clusters = [] }, { data: nodes = [] }, { data: edges = [] }] = await Promise.all([
        supabase.from('neural_clusters').select('cluster_id, name, color, description').eq('workspace_id', workspaceId),
        supabase.from('neural_nodes').select('node_id, label, room, block_ts, clusters, source').eq('workspace_id', workspaceId),
        supabase.from('neural_edges').select('from_node, to_node, type, via_cluster').eq('workspace_id', workspaceId),
      ])
      if (format === 'markdown') {
        // Prefer on-disk NEURAL_INDEX.md (option C grounding) for consistency
        const md = await ghGetContent(ghToken, owner, repo, branch, '.cotext/NEURAL_INDEX.md')
        if (md) return new Response(md, { headers: { ...corsHeaders, 'Content-Type': 'text/markdown; charset=utf-8' } })
        return json({ error: 'No NEURAL_INDEX.md — push from Cotext app to generate.' }, 404)
      }
      const graph = {
        clusters: clusters?.map((c) => ({ id: c.cluster_id, name: c.name, color: c.color, desc: c.description })) ?? [],
        nodes: nodes?.map((n) => ({ id: n.node_id, label: n.label, room: n.room, blockTs: n.block_ts, clusters: n.clusters, source: n.source })) ?? [],
        edges: edges?.map((e) => ({ from: e.from_node, to: e.to_node, type: e.type, viaCluster: e.via_cluster })) ?? [],
      }
      if (format === 'json') return json(graph)
      // summary
      const sizes = graph.clusters.map((c) => ({ cluster: c.name, id: c.id, count: graph.nodes.filter((n) => n.clusters.includes(c.id)).length }))
        .sort((a, b) => b.count - a.count)
      return json({
        counts: { nodes: graph.nodes.length, clusters: graph.clusters.length, edges: graph.edges.length },
        clusters_by_size: sizes,
      })
    }

    // GET /neural/find_related?node_id=...
    if (path === 'neural/find_related' && req.method === 'GET') {
      const nodeId = url.searchParams.get('node_id') || ''
      if (!nodeId) return json({ error: 'node_id query param required' }, 400)
      const { data: self } = await supabase.from('neural_nodes').select('*').eq('workspace_id', workspaceId).eq('node_id', nodeId).maybeSingle()
      if (!self) return json({ error: `Node ${nodeId} not found` }, 404)
      const [{ data: nodes = [] }, { data: edges = [] }] = await Promise.all([
        supabase.from('neural_nodes').select('node_id, label, room, block_ts, clusters').eq('workspace_id', workspaceId),
        supabase.from('neural_edges').select('from_node, to_node, type').eq('workspace_id', workspaceId)
          .or(`from_node.eq.${nodeId},to_node.eq.${nodeId}`),
      ])
      const selfClusters: string[] = self.clusters || []
      const sameCluster = (nodes || []).filter((n) => n.node_id !== nodeId && (n.clusters || []).some((c: string) => selfClusters.includes(c)))
        .map((n) => ({ id: n.node_id, label: n.label, room: n.room, blockTs: n.block_ts, via: (n.clusters || []).filter((c: string) => selfClusters.includes(c)) }))
      const linked = (edges || []).map((e) => {
        const otherId = e.from_node === nodeId ? e.to_node : e.from_node
        const n = (nodes || []).find((x) => x.node_id === otherId)
        return n ? { id: n.node_id, label: n.label, room: n.room, blockTs: n.block_ts, type: e.type } : null
      }).filter(Boolean)
      return json({
        self: { id: self.node_id, label: self.label, room: self.room, blockTs: self.block_ts, clusters: selfClusters },
        same_cluster: sameCluster,
        linked,
      })
    }

    // GET /neural/search_clusters?q=...
    if (path === 'neural/search_clusters' && req.method === 'GET') {
      const q = url.searchParams.get('q') || ''
      if (!q.trim()) return json([])
      const like = `%${q.replace(/[%_]/g, (m) => '\\' + m)}%`
      const { data: matches = [] } = await supabase.from('neural_clusters')
        .select('cluster_id, name, color, description').eq('workspace_id', workspaceId).ilike('name', like)
      const ids = (matches || []).map((c) => c.cluster_id)
      const { data: nodes = [] } = ids.length === 0
        ? { data: [] }
        : await supabase.from('neural_nodes').select('node_id, label, room, block_ts, clusters, source')
            .eq('workspace_id', workspaceId).overlaps('clusters', ids)
      const result = (matches || []).map((c) => ({
        cluster: { id: c.cluster_id, name: c.name, desc: c.description },
        members: (nodes || []).filter((n) => (n.clusters || []).includes(c.cluster_id))
          .map((n) => ({ id: n.node_id, label: n.label, room: n.room, blockTs: n.block_ts, source: n.source })),
      }))
      return json(result)
    }

    // GET /neural/node?id=...
    if (path === 'neural/node' && req.method === 'GET') {
      const nodeId = url.searchParams.get('id') || ''
      if (!nodeId) return json({ error: 'id query param required' }, 400)
      const { data: self } = await supabase.from('neural_nodes').select('*').eq('workspace_id', workspaceId).eq('node_id', nodeId).maybeSingle()
      if (!self) return json({ error: `Node ${nodeId} not found` }, 404)
      // Fetch the room content from GitHub and extract this block's text
      const roomFilePath = self.room === 'root'
        ? '.cotext/cotext.md'
        : `${self.room}/.cotext/cotext.md`
      const roomContent = await ghGetContent(ghToken, owner, repo, branch, roomFilePath)
      let blockText = ''
      if (roomContent) {
        const lines = roomContent.split('\n')
        const headerRe = new RegExp('^##\\s+' + self.block_ts.replace(/[-:.\s]/g, '\\$&'))
        let start = -1
        for (let i = 0; i < lines.length; i++) if (headerRe.test(lines[i])) { start = i; break }
        if (start !== -1) {
          let end = lines.length
          for (let i = start + 1; i < lines.length; i++) {
            if (/^##\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(lines[i])) { end = i; break }
          }
          blockText = lines.slice(start + 1, end)
            .filter((l) => !/^<!--\s*(source|node):/.test(l)).join('\n').trim()
        }
      }
      // Adjacent (same cluster + edge) — minimal labels only
      const selfClusters: string[] = self.clusters || []
      const { data: adjNodes = [] } = await supabase.from('neural_nodes').select('node_id, label, room, clusters')
        .eq('workspace_id', workspaceId).overlaps('clusters', selfClusters.length > 0 ? selfClusters : ['__none__'])
      const { data: adjEdges = [] } = await supabase.from('neural_edges').select('from_node, to_node, type')
        .eq('workspace_id', workspaceId).or(`from_node.eq.${nodeId},to_node.eq.${nodeId}`)
      const adjacent: Array<Record<string, unknown>> = []
      for (const n of (adjNodes || [])) {
        if (n.node_id === nodeId) continue
        const via = (n.clusters || []).filter((c: string) => selfClusters.includes(c))
        if (via.length > 0) adjacent.push({ id: n.node_id, label: n.label, room: n.room, relation: `cluster:${via.join(',')}` })
      }
      for (const e of (adjEdges || [])) {
        const otherId = e.from_node === nodeId ? e.to_node : e.from_node
        const n = (adjNodes || []).find((x) => x.node_id === otherId)
        if (n) adjacent.push({ id: n.node_id, label: n.label, room: n.room, relation: 'edge', type: e.type })
      }
      return json({
        id: self.node_id, label: self.label, room: self.room, blockTs: self.block_ts,
        clusters: selfClusters, source: self.source,
        block_text: blockText,
        adjacent,
      })
    }

    // GET /guide — COTEXT_GUIDE.md
    if (path === 'guide' && req.method === 'GET') {
      const content = await ghGetContent(ghToken, owner, repo, branch, '.cotext/COTEXT_GUIDE.md')
      if (!content) return json({ error: 'No COTEXT_GUIDE.md found. Push from Cotext app to generate.' }, 404)
      return new Response(content, {
        headers: { ...corsHeaders, 'Content-Type': 'text/markdown; charset=utf-8' }
      })
    }

    return json({ error: `Unknown endpoint: ${path}`, available: ['tools', 'rooms', 'rooms/:path', 'search', 'pack/:path', 'rooms/:path/append', 'guide', 'neural/graph', 'neural/find_related', 'neural/search_clusters', 'neural/node'] }, 404)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[context-api]', msg)
    return json({ error: msg }, 500)
  }
})
