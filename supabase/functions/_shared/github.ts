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
