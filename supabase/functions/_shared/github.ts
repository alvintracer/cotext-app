import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function getGitHubToken(authHeader: string): Promise<{ token: string; userId: string }> {
  // Verify user via JWT
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    throw new Error('Unauthorized')
  }

  // Get GitHub token from github_connections using service role
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: conn } = await admin
    .from('github_connections')
    .select('access_token_encrypted')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!conn?.access_token_encrypted) {
    throw new Error('GitHub not connected. Please re-login with GitHub.')
  }

  return { token: conn.access_token_encrypted, userId: user.id }
}

// Resolve the GitHub token that should access a repo in shared-workspace mode.
// If the caller is a member of a workspace for this owner/repo, use that
// workspace owner's GitHub token so invited members can read/write the same repo
// without needing their own collaborator token. Otherwise, fall back to the
// caller's own connected GitHub token.
export async function getWorkspaceGitHubToken(
  authHeader: string,
  owner: string,
  repo: string,
): Promise<{ token: string; userId: string; tokenOwnerUserId: string }> {
  const self = await getGitHubToken(authHeader)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: workspaces, error: wsError } = await admin
    .from('workspaces')
    .select('id, user_id, created_at')
    .eq('github_owner', owner)
    .eq('github_repo', repo)
    .order('created_at', { ascending: true })

  if (wsError || !workspaces || workspaces.length === 0) {
    return { ...self, tokenOwnerUserId: self.userId }
  }

  const workspaceIds = workspaces.map((w: { id: string }) => w.id)
  const { data: memberships } = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', self.userId)
    .in('workspace_id', workspaceIds)

  const memberOf = new Set((memberships || []).map((m: { workspace_id: string }) => m.workspace_id))
  const matchedWorkspace = workspaces.find((w: { id: string; user_id: string }) => (
    w.user_id === self.userId || memberOf.has(w.id)
  ))

  if (!matchedWorkspace) {
    return { ...self, tokenOwnerUserId: self.userId }
  }

  if (matchedWorkspace.user_id === self.userId) {
    return { ...self, tokenOwnerUserId: self.userId }
  }

  const { data: ownerConn } = await admin
    .from('github_connections')
    .select('access_token_encrypted')
    .eq('user_id', matchedWorkspace.user_id)
    .maybeSingle()

  if (!ownerConn?.access_token_encrypted) {
    return { ...self, tokenOwnerUserId: self.userId }
  }

  return {
    token: ownerConn.access_token_encrypted,
    userId: self.userId,
    tokenOwnerUserId: matchedWorkspace.user_id,
  }
}

export async function githubFetch(token: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Cotext-App',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub API error ${res.status}: ${body}`)
  }

  return res.json()
}

/**
 * Ensure a GitHub repo exists. Creates it if it doesn't.
 * Returns true if repo exists (or was created).
 */
export async function ensureRepoExists(token: string, owner: string, repo: string): Promise<boolean> {
  const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Cotext-App',
    },
  })

  if (checkRes.ok) return true

  if (checkRes.status === 404) {
    console.log(`[github] Repo ${owner}/${repo} not found, creating...`)
    const createRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Cotext-App',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: repo,
        private: true,
        auto_init: true,
        description: `Cotext workspace for ${repo}`,
      }),
    })

    if (createRes.ok) {
      console.log(`[github] Repo ${owner}/${repo} created successfully`)
      // Wait a moment for GitHub to initialize the repo
      await new Promise(resolve => setTimeout(resolve, 2000))
      return true
    }

    const errText = await createRes.text()
    console.error(`[github] Failed to create repo: ${createRes.status} ${errText}`)
    throw new Error(`Failed to create repo ${owner}/${repo}: ${errText}`)
  }

  return false
}
