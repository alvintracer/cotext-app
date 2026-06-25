// trigger-neural-compile — force the neural-compile workflow to run NOW.
//
// Why it exists: graphs can go stale (e.g. an earlier compile included files
// the new compiler now filters out — CLAUDE.md, log.md, prompts/*, etc.).
// The user can't always wait for the next markdown push to retrigger the
// workflow. This endpoint fires GitHub's `workflow_dispatch` so the user gets
// a fresh compile in ~30s without needing to leave Cotext or touch git.

import { corsHeaders } from '../_shared/cors.ts'
import { getWorkspaceGitHubToken } from '../_shared/github.ts'

const GH = 'https://api.github.com'
const WORKFLOW_PATH = '.github/workflows/neural-compile.yml'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json().catch(() => ({}))
    const owner = typeof body.owner === 'string' ? body.owner.trim() : ''
    const repo = typeof body.repo === 'string' ? body.repo.trim() : ''
    const branch = typeof body.branch === 'string' ? body.branch.trim() : 'main'
    if (!owner || !repo) {
      return new Response(JSON.stringify({ error: 'owner and repo are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { token } = await getWorkspaceGitHubToken(authHeader, owner, repo)
    const ghHeaders = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Cotext-App',
      'Content-Type': 'application/json',
    }

    // GitHub workflow_dispatch is keyed by file path OR workflow id.
    // Using the file path is more robust — no extra lookup needed.
    const encodedPath = encodeURIComponent(WORKFLOW_PATH)
    const dispatchUrl = `${GH}/repos/${owner}/${repo}/actions/workflows/${encodedPath}/dispatches`
    const res = await fetch(dispatchUrl, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({ ref: branch }),
    })

    if (!res.ok) {
      const err = await res.text()
      // 404 most often = workflow file isn't in that branch yet (workspace
      // hasn't been wiki-init'd with the workflow). Surface a hint.
      if (res.status === 404) {
        return new Response(JSON.stringify({
          error: 'Workflow file not found on this branch. Set up the wiki + workflow first.',
          status: 404,
        }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      // 403 most often = the GitHub token lacks `actions:write` scope.
      if (res.status === 403) {
        return new Response(JSON.stringify({
          error: 'GitHub token cannot dispatch workflows. Reconnect GitHub with workflow scope.',
          status: 403,
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ error: `GitHub workflow_dispatch failed: ${res.status} ${err}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      ok: true,
      message: 'Neural-compile workflow dispatched. The graph will refresh in ~30s.',
      actionsUrl: `https://github.com/${owner}/${repo}/actions/workflows/neural-compile.yml`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[trigger-neural-compile] Error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
