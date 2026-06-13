-- ============================================================
-- Cotext — Team Collaboration: Invites + Teammates
-- ============================================================

-- 1. Workspace Invites
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  created_by uuid references auth.users(id) on delete cascade,
  github_owner text not null,
  github_repo text not null,
  default_branch text default 'main',
  suggested_name text,
  expires_at timestamptz,
  max_uses int,
  use_count int default 0,
  created_at timestamptz default now()
);

-- 2. RLS for workspace_invites
alter table public.workspace_invites enable row level security;

drop policy if exists "Anyone can read invites" on public.workspace_invites;
create policy "Anyone can read invites"
  on public.workspace_invites for select
  using (true);

drop policy if exists "Users can create own invites" on public.workspace_invites;
create policy "Users can create own invites"
  on public.workspace_invites for insert
  with check (auth.uid() = created_by);

drop policy if exists "Users can delete own invites" on public.workspace_invites;
create policy "Users can delete own invites"
  on public.workspace_invites for delete
  using (auth.uid() = created_by);

drop policy if exists "Anyone can update invite use_count" on public.workspace_invites;
create policy "Anyone can update invite use_count"
  on public.workspace_invites for update
  using (true);

-- 3. Profiles: allow users to see teammate profiles
-- (users who share the same github_owner/github_repo via workspaces)
drop policy if exists "Users can view teammate profiles" on public.profiles;
create policy "Users can view teammate profiles"
  on public.profiles for select
  using (
    id in (
      select w2.user_id from public.workspaces w2
      where (w2.github_owner, w2.github_repo) in (
        select w1.github_owner, w1.github_repo from public.workspaces w1
        where w1.user_id = auth.uid()
      )
    )
  );

-- 4. Postgres function: get teammates for a given repo
create or replace function public.get_repo_teammates(
  p_github_owner text,
  p_github_repo text
)
returns table (
  user_id uuid,
  display_name text,
  github_username text
)
language sql
security definer
stable
as $$
  select distinct
    p.id as user_id,
    p.display_name,
    p.github_username
  from public.workspaces w
  join public.profiles p on p.id = w.user_id
  where w.github_owner = p_github_owner
    and w.github_repo = p_github_repo
    and w.user_id != auth.uid()
$$;
