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

async function seedEmptyRepoWithContentsApi(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: Array<{ path: string; content: string }>,
) {
  const createdPaths: string[] = []
  const skippedPaths: string[] = []
  const warnings: string[] = []
  for (const file of files) {
    const bytes = new TextEncoder().encode(file.content)
    const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
    const b64 = btoa(binString)
    const res = await fetch(`${GH}/repos/${owner}/${repo}/contents/${file.path}`, {
      method: 'PUT',
      headers: ghHeaders(token),
      body: JSON.stringify({
        message: `cotext: seed ${file.path}`,
        content: b64,
        branch,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      if ((res.status === 403 || res.status === 404) && file.path.startsWith('.github/workflows/')) {
        skippedPaths.push(file.path)
        warnings.push('Workflow file was skipped. Reconnect GitHub with workflow scope to enable auto-compile.')
        continue
      }
      throw new Error(`Initial file creation failed for ${file.path}: ${res.status} ${err}`)
    }
    createdPaths.push(file.path)
  }
  return { createdPaths, skippedPaths, warnings }
}

async function getRepoDefaultBranch(token: string, owner: string, repo: string) {
  const res = await fetch(`${GH}/repos/${owner}/${repo}`, {
    headers: ghHeaders(token),
  })
  if (!res.ok) return null
  const data = await res.json()
  return typeof data.default_branch === 'string' && data.default_branch
    ? data.default_branch
    : null
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

    const body = await req.json().catch(() => ({})) as InitRequest
    const { owner, repo, branch = 'main', force = false } = body
    if (!owner || !repo) {
      return new Response(JSON.stringify({ error: 'owner and repo are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { token } = await getWorkspaceGitHubToken(authHeader, owner, repo)
    await ensureRepoExists(token, owner, repo)

    let targetBranch = branch
    const repoDefaultBranch = await getRepoDefaultBranch(token, owner, repo)

    // 1. Get current HEAD of branch
    let refRes = await fetch(`${GH}/repos/${owner}/${repo}/git/ref/heads/${targetBranch}`, {
      headers: ghHeaders(token),
    })
    if (!refRes.ok && refRes.status === 404 && repoDefaultBranch && repoDefaultBranch !== targetBranch) {
      targetBranch = repoDefaultBranch
      refRes = await fetch(`${GH}/repos/${owner}/${repo}/git/ref/heads/${targetBranch}`, {
        headers: ghHeaders(token),
      })
    }
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
      return new Response(JSON.stringify({ error: `Cannot read branch ${targetBranch}: ${refRes.status} ${err}` }), {
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

    // Empty repos can 404 on the low-level git/trees bootstrap path because no
    // branch/HEAD exists yet. Fall back to the Contents API to create the first
    // commit(s), then later pushes can use the git database path normally.
    if (!parentSha) {
      const { createdPaths, skippedPaths, warnings } = await seedEmptyRepoWithContentsApi(token, owner, repo, targetBranch, filesToCreate)
      return new Response(JSON.stringify({
        ok: true,
        created: createdPaths.length,
        skipped: skipped.length + skippedPaths.length,
        created_paths: createdPaths,
        skipped_paths: [...skipped, ...skippedPaths],
        warnings,
        message: warnings.length > 0
          ? `Wiki initialized on ${targetBranch}, but workflow setup was skipped. Reconnect GitHub with workflow scope, then run wiki setup again.`
          : `Wiki initialized in an empty repo on ${targetBranch}: ${createdPaths.length} files created, ${skipped.length} skipped.`,
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
      if (treeRes.status === 404) {
        const { createdPaths, skippedPaths, warnings } = await seedEmptyRepoWithContentsApi(token, owner, repo, targetBranch, filesToCreate)
        return new Response(JSON.stringify({
          ok: true,
          created: createdPaths.length,
          skipped: skipped.length + skippedPaths.length,
          created_paths: createdPaths,
          skipped_paths: [...skipped, ...skippedPaths],
          warnings,
          message: warnings.length > 0
            ? `Wiki initialized on ${targetBranch}, but workflow setup was skipped. Reconnect GitHub with workflow scope, then run wiki setup again.`
            : `Wiki initialized via safe fallback on ${targetBranch}: ${createdPaths.length} files created, ${skipped.length} skipped.`,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
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
    const updateUrl = `${GH}/repos/${owner}/${repo}/git/refs/heads/${targetBranch}`
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
