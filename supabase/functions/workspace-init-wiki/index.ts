// workspace-init-wiki — server-side scaffold of the LLM-wiki structure into
// a user's GitHub repo. Mirrors what `npx cotext init` does locally, but for
// users who connected the repo via Cotext without ever cloning it.
//
// All seed files committed in ONE git commit via the Trees API, so the user
// sees a single clean entry in repo history. Non-destructive: existing files
// are skipped unless `force=true`.

import { corsHeaders } from '../_shared/cors.ts'
import { getWorkspaceGitHubToken, ensureRepoExists } from '../_shared/github.ts'
import { SEED_FILES } from '../_shared/wiki-seed.ts'

interface InitRequest {
  workspace_id?: string;
  owner?: string;
  repo?: string;
  branch?: string;
  force?: boolean;
}

const GH = 'https://api.github.com'
const ghHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'Cotext-App',
  'Content-Type': 'application/json',
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json().catch(() => ({})) as InitRequest
    const { owner, repo, branch = 'main', force = false } = body
    if (!owner || !repo) {
      return new Response(JSON.stringify({ error: 'owner and repo are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { token } = await getWorkspaceGitHubToken(authHeader, owner, repo)
    await ensureRepoExists(token, owner, repo)

    // 1. Get current HEAD of branch
    const refRes = await fetch(`${GH}/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
      headers: ghHeaders(token),
    })
    let parentSha: string | null = null
    let baseTreeSha: string | null = null
    if (refRes.ok) {
      const refData = await refRes.json()
      parentSha = refData.object.sha
      // Get the tree of that commit
      const commitRes = await fetch(`${GH}/repos/${owner}/${repo}/git/commits/${parentSha}`, {
        headers: ghHeaders(token),
      })
      if (commitRes.ok) {
        const commitData = await commitRes.json()
        baseTreeSha = commitData.tree.sha
      }
    } else if (refRes.status !== 404 && refRes.status !== 409) {
      const err = await refRes.text()
      return new Response(JSON.stringify({ error: `Cannot read branch ${branch}: ${refRes.status} ${err}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. List existing paths (for non-destructive skip).
    const existingPaths = new Set<string>()
    if (baseTreeSha) {
      const treeRes = await fetch(`${GH}/repos/${owner}/${repo}/git/trees/${baseTreeSha}?recursive=1`, {
        headers: ghHeaders(token),
      })
      if (treeRes.ok) {
        const treeData = await treeRes.json()
        for (const entry of (treeData.tree || [])) {
          if (entry.type === 'blob') existingPaths.add(entry.path)
        }
      }
    }

    // 3. Decide which files to create.
    const TODAY = new Date().toISOString().slice(0, 10)
    const filesToCreate: Array<{ path: string; content: string }> = []
    const skipped: string[] = []
    for (const [path, rawContent] of Object.entries(SEED_FILES)) {
      if (!force && existingPaths.has(path)) {
        skipped.push(path)
        continue
      }
      // Substitute %TODAY% placeholder (used in log.md)
      filesToCreate.push({ path, content: rawContent.replace(/%TODAY%/g, TODAY) })
    }

    if (filesToCreate.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        created: 0,
        skipped: skipped.length,
        skipped_paths: skipped,
        message: 'Wiki already initialized — nothing to do.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 4. Create blobs for each new file (base64 content for unicode safety).
    const blobShas = new Map<string, string>()
    for (const { path, content } of filesToCreate) {
      const bytes = new TextEncoder().encode(content)
      const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
      const b64 = btoa(binString)
      const blobRes = await fetch(`${GH}/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        headers: ghHeaders(token),
        body: JSON.stringify({ content: b64, encoding: 'base64' }),
      })
      if (!blobRes.ok) {
        const err = await blobRes.text()
        return new Response(JSON.stringify({ error: `Blob creation failed for ${path}: ${blobRes.status} ${err}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const blob = await blobRes.json()
      blobShas.set(path, blob.sha)
    }

    // 5. Create a new tree (based on existing tree, or empty if first commit).
    const treePayload: Record<string, unknown> = {
      tree: [...blobShas.entries()].map(([path, sha]) => ({
        path,
        mode: '100644',
        type: 'blob',
        sha,
      })),
    }
    if (baseTreeSha) treePayload.base_tree = baseTreeSha
    const treeRes = await fetch(`${GH}/repos/${owner}/${repo}/git/trees`, {
      method: 'POST', headers: ghHeaders(token), body: JSON.stringify(treePayload),
    })
    if (!treeRes.ok) {
      const err = await treeRes.text()
      return new Response(JSON.stringify({ error: `Tree creation failed: ${treeRes.status} ${err}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const tree = await treeRes.json()

    // 6. Create commit.
    const commitPayload: Record<string, unknown> = {
      message: 'cotext: initialize MindSync wiki structure',
      tree: tree.sha,
    }
    if (parentSha) commitPayload.parents = [parentSha]
    const commitRes = await fetch(`${GH}/repos/${owner}/${repo}/git/commits`, {
      method: 'POST', headers: ghHeaders(token), body: JSON.stringify(commitPayload),
    })
    if (!commitRes.ok) {
      const err = await commitRes.text()
      return new Response(JSON.stringify({ error: `Commit creation failed: ${commitRes.status} ${err}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const commit = await commitRes.json()

    // 7. Update/create ref.
    const updateUrl = `${GH}/repos/${owner}/${repo}/git/refs/heads/${branch}`
    if (parentSha) {
      const updRes = await fetch(updateUrl, {
        method: 'PATCH', headers: ghHeaders(token),
        body: JSON.stringify({ sha: commit.sha, force: false }),
      })
      if (!updRes.ok) {
        const err = await updRes.text()
        return new Response(JSON.stringify({ error: `Ref update failed: ${updRes.status} ${err}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    } else {
      // First commit on an empty repo — create the ref instead of updating.
      const createRes = await fetch(`${GH}/repos/${owner}/${repo}/git/refs`, {
        method: 'POST', headers: ghHeaders(token),
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
      })
      if (!createRes.ok) {
        const err = await createRes.text()
        return new Response(JSON.stringify({ error: `Ref creation failed: ${createRes.status} ${err}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      created: filesToCreate.length,
      skipped: skipped.length,
      created_paths: filesToCreate.map((f) => f.path),
      skipped_paths: skipped,
      commit_sha: commit.sha,
      message: `Wiki initialized: ${filesToCreate.length} files committed, ${skipped.length} skipped. The neural-compile workflow will run on next push to generate .cotext/neural.json.`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[workspace-init-wiki] Error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
