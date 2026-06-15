// ============================================================
// Neural Link — derived index Edge Function (P3, 결정 D-009 / 계획서 §32)
//
// 정본은 repo(.cotext/neural.json + cotext.md 인라인). 이 함수는 그것을
// Supabase 파생 인덱스(neural_clusters/nodes/edges)에 채워 빠른 쿼리와
// 크로스 레포 검색을 가능케 한다. 인증된 사용자(JWT)만.
//
// actions:
//   sync     : { workspace_id, graph }  — 클라이언트 in-memory 그래프를 인덱스에 반영(레포 단위 교체)
//   search   : { query, limit? }        — 사용자의 모든 레포를 가로지르는 클러스터/노드 검색
//   reindex  : {}                        — 서버가 GitHub에서 각 레포의 neural.json을 직접 읽어 인덱스 재구축
// ============================================================

import { corsHeaders } from '../_shared/cors.ts'
import { getGitHubToken } from '../_shared/github.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface Cluster { id: string; name: string; color?: string; desc?: string }
interface NeuralNode { id: string; room: string; blockTs: string; label?: string; clusters?: string[]; source?: string }
interface Edge { from: string; to: string; type?: string; viaCluster?: string }
interface Graph { clusters?: Cluster[]; nodes?: NeuralNode[]; edges?: Edge[] }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function base64ToUtf8(b64: string): string {
  const bin = atob((b64 || '').replace(/\n/g, ''))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

// Replace one workspace's index rows with the given graph (repo = unit of truth).
async function syncWorkspace(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
  graph: Graph,
): Promise<{ clusters: number; nodes: number; edges: number }> {
  // Clear existing rows for this workspace (no FKs between these tables; order free)
  await db.from('neural_edges').delete().eq('workspace_id', workspaceId)
  await db.from('neural_nodes').delete().eq('workspace_id', workspaceId)
  await db.from('neural_clusters').delete().eq('workspace_id', workspaceId)

  const clusters = (graph.clusters ?? []).map((c) => ({
    workspace_id: workspaceId, user_id: userId,
    cluster_id: c.id, name: c.name, color: c.color ?? null, description: c.desc ?? null,
  }))

  const nodeSeen = new Set<string>()
  const nodes = (graph.nodes ?? [])
    .filter((n) => n.id && !nodeSeen.has(n.id) && nodeSeen.add(n.id))
    .map((n) => ({
      workspace_id: workspaceId, user_id: userId,
      node_id: n.id, room: n.room, block_ts: n.blockTs,
      label: n.label ?? '', clusters: n.clusters ?? [], source: n.source ?? null,
    }))

  const edgeSeen = new Set<string>()
  const edges = (graph.edges ?? [])
    .filter((e) => e.from && e.to && e.from !== e.to)
    .filter((e) => { const k = `${e.from}::${e.to}`; return !edgeSeen.has(k) && edgeSeen.add(k) })
    .map((e) => ({
      workspace_id: workspaceId, user_id: userId,
      from_node: e.from, to_node: e.to, type: e.type ?? null, via_cluster: e.viaCluster ?? null,
    }))

  if (clusters.length) { const { error } = await db.from('neural_clusters').insert(clusters); if (error) throw error }
  if (nodes.length) { const { error } = await db.from('neural_nodes').insert(nodes); if (error) throw error }
  if (edges.length) { const { error } = await db.from('neural_edges').insert(edges); if (error) throw error }

  return { clusters: clusters.length, nodes: nodes.length, edges: edges.length }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    // User-scoped client — RLS enforces per-user ownership on all reads/writes.
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await db.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
    const userId = user.id

    const body = await req.json().catch(() => ({}))
    const action = body.action as string

    // --- sync: client pushes its in-memory graph for one workspace ---
    if (action === 'sync') {
      const { workspace_id, graph } = body
      if (!workspace_id || !graph) return json({ error: 'workspace_id and graph required' }, 400)
      // Ownership check (RLS would also block, but fail clearly)
      const { data: ws } = await db.from('workspaces').select('id').eq('id', workspace_id).maybeSingle()
      if (!ws) return json({ error: 'Workspace not found' }, 403)
      const counts = await syncWorkspace(db, userId, workspace_id, graph as Graph)
      return json({ ok: true, ...counts })
    }

    // --- search: cross-repo cluster + node search across all the user's workspaces ---
    if (action === 'search') {
      const q = String(body.query ?? '').trim()
      const limit = Math.min(Number(body.limit) || 50, 200)
      if (!q) return json({ clusters: [], nodes: [] })
      const like = `%${q.replace(/[%_]/g, (m) => '\\' + m)}%`

      const { data: clusters, error: cErr } = await db
        .from('neural_clusters')
        .select('cluster_id, name, color, workspace_id, workspaces(github_owner, github_repo)')
        .ilike('name', like)
        .limit(limit)
      if (cErr) throw cErr

      const { data: nodes, error: nErr } = await db
        .from('neural_nodes')
        .select('node_id, label, room, block_ts, clusters, source, workspace_id, workspaces(github_owner, github_repo)')
        .ilike('label', like)
        .limit(limit)
      if (nErr) throw nErr

      return json({ clusters: clusters ?? [], nodes: nodes ?? [] })
    }

    // --- reindex: server reads neural.json from GitHub for every workspace ---
    if (action === 'reindex') {
      const { token } = await getGitHubToken(authHeader)
      const { data: workspaces, error: wErr } = await db
        .from('workspaces')
        .select('id, github_owner, github_repo, default_branch, cotext_folder_name')
      if (wErr) throw wErr

      const results: Array<Record<string, unknown>> = []
      for (const ws of workspaces ?? []) {
        try {
          const folder = (ws.cotext_folder_name || '.cotext').replace(/\/$/, '')
          const path = `${folder}/neural.json`
          const res = await fetch(
            `https://api.github.com/repos/${ws.github_owner}/${ws.github_repo}/contents/${path}?ref=${ws.default_branch || 'main'}`,
            { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Cotext-App' } },
          )
          if (res.status === 404) { results.push({ workspace_id: ws.id, repo: `${ws.github_owner}/${ws.github_repo}`, skipped: 'no neural.json' }); continue }
          if (!res.ok) { results.push({ workspace_id: ws.id, error: `GitHub ${res.status}` }); continue }
          const data = await res.json()
          const graph = JSON.parse(base64ToUtf8(data.content)) as Graph
          const counts = await syncWorkspace(db, userId, ws.id, graph)
          results.push({ workspace_id: ws.id, repo: `${ws.github_owner}/${ws.github_repo}`, ...counts })
        } catch (e) {
          results.push({ workspace_id: ws.id, error: e instanceof Error ? e.message : String(e) })
        }
      }
      return json({ ok: true, results })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[neural-index] Error:', message)
    const status = message === 'Unauthorized' ? 401 : 500
    return json({ error: message }, status)
  }
})
