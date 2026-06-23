// wiki-push-batch — push an arbitrary set of files in a single git commit.
// Powers the "Synthesize → wiki" flow: the LLM proposes N wiki documents,
// the user picks which to keep, and this endpoint commits them atomically
// so repo history stays clean (one entry per synthesis session) and the
// neural-compile workflow fires exactly once.
//
// Reuses the Trees+Commits+Refs pattern proven in workspace-init-wiki.
// Non-destructive by default — already-existing paths are skipped unless
// `force=true`.

import { corsHeaders } from '../_shared/cors.ts'
import { getWorkspaceGitHubToken, ensureRepoExists } from '../_shared/github.ts'

interface FileInput { path: string; content: string }
interface BatchRequest {
  owner: string;
  repo: string;
  branch?: string;
  files: FileInput[];
  message?: string;
  force?: boolean;
}

const GH = 'https://api.github.com'
const ghHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'Cotext-App',
  'Content-Type': 'application/json',
})

function isValidPath(p: string): boolean {
  if (!p || typeof p !== 'string') return false
  if (p.startsWith('/') || p.includes('..')) return false
  if (p.length > 256) return false
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json().catch(() => ({})) as BatchRequest
    const { owner, repo, branch = 'main', files = [], message, force = false } = body
    if (!owner || !repo) {
      return new Response(JSON.stringify({ error: 'owner and repo are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (!Array.isArray(files) || files.length === 0) {
      return new Response(JSON.stringify({ error: 'files array is required and non-empty' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    // Guard against malformed paths from upstream prompt drift.
    for (const f of files) {
      if (!isValidPath(f.path)) {
        return new Response(JSON.stringify({ error: `Invalid path: ${f.path}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (typeof f.content !== 'string') {
        return new Response(JSON.stringify({ error: `Content for ${f.path} must be a string` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    const { token } = await getWorkspaceGitHubToken(authHeader, owner, repo)
    await ensureRepoExists(token, owner, repo)

    // 1. Resolve HEAD of branch
    const refRes = await fetch(`${GH}/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
      headers: ghHeaders(token),
    })
    if (!refRes.ok) {
      const err = await refRes.text()
      return new Response(JSON.stringify({ error: `Cannot read branch ${branch}: ${refRes.status} ${err}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const refData = await refRes.json()
    const parentSha = refData.object.sha
    const commitFetch = await fetch(`${GH}/repos/${owner}/${repo}/git/commits/${parentSha}`, {
      headers: ghHeaders(token),
    })
    if (!commitFetch.ok) {
      return new Response(JSON.stringify({ error: `Cannot read commit ${parentSha}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const commitData = await commitFetch.json()
    const baseTreeSha = commitData.tree.sha

    // 2. Existing path set (for non-destructive skip).
    const existingPaths = new Set<string>()
    const treeRes = await fetch(`${GH}/repos/${owner}/${repo}/git/trees/${baseTreeSha}?recursive=1`, {
      headers: ghHeaders(token),
    })
    if (treeRes.ok) {
      const treeData = await treeRes.json()
      for (const entry of (treeData.tree || [])) {
        if (entry.type === 'blob') existingPaths.add(entry.path)
      }
    }

    // 3. Pick files to actually write.
    const toCreate: FileInput[] = []
    const skipped: string[] = []
    for (const f of files) {
      if (!force && existingPaths.has(f.path)) {
        skipped.push(f.path)
        continue
      }
      toCreate.push(f)
    }
    if (toCreate.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        created: 0,
        skipped: skipped.length,
        skipped_paths: skipped,
        message: 'All files already exist — nothing to commit.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 4. Create blobs.
    const blobShas = new Map<string, string>()
    for (const f of toCreate) {
      const bytes = new TextEncoder().encode(f.content)
      const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
      const b64 = btoa(binString)
      const blobRes = await fetch(`${GH}/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST', headers: ghHeaders(token),
        body: JSON.stringify({ content: b64, encoding: 'base64' }),
      })
      if (!blobRes.ok) {
        const err = await blobRes.text()
        return new Response(JSON.stringify({ error: `Blob create failed for ${f.path}: ${blobRes.status} ${err}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const blob = await blobRes.json()
      blobShas.set(f.path, blob.sha)
    }

    // 5. Build new tree (base = current HEAD tree).
    const newTreeRes = await fetch(`${GH}/repos/${owner}/${repo}/git/trees`, {
      method: 'POST', headers: ghHeaders(token),
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [...blobShas.entries()].map(([path, sha]) => ({
          path, mode: '100644', type: 'blob', sha,
        })),
      }),
    })
    if (!newTreeRes.ok) {
      const err = await newTreeRes.text()
      return new Response(JSON.stringify({ error: `Tree create failed: ${newTreeRes.status} ${err}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const newTree = await newTreeRes.json()

    // 6. Commit.
    const commitRes = await fetch(`${GH}/repos/${owner}/${repo}/git/commits`, {
      method: 'POST', headers: ghHeaders(token),
      body: JSON.stringify({
        message: message || `cotext: synthesize ${toCreate.length} wiki document(s)`,
        tree: newTree.sha,
        parents: [parentSha],
      }),
    })
    if (!commitRes.ok) {
      const err = await commitRes.text()
      return new Response(JSON.stringify({ error: `Commit failed: ${commitRes.status} ${err}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const commit = await commitRes.json()

    // 7. Update ref.
    const updRes = await fetch(`${GH}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH', headers: ghHeaders(token),
      body: JSON.stringify({ sha: commit.sha, force: false }),
    })
    if (!updRes.ok) {
      const err = await updRes.text()
      return new Response(JSON.stringify({ error: `Ref update failed: ${updRes.status} ${err}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      ok: true,
      created: toCreate.length,
      skipped: skipped.length,
      created_paths: toCreate.map((f) => f.path),
      skipped_paths: skipped,
      commit_sha: commit.sha,
      message: `${toCreate.length} files committed (${skipped.length} skipped). The neural-compile workflow will run next.`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[wiki-push-batch] Error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
