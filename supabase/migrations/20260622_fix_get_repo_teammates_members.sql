-- Fix: `get_repo_teammates` was returning only people who built their OWN
-- workspace for the repo (i.e. workspaces.user_id). Anyone joined via the
-- invite flow lives in `workspace_members` and was invisible — so the team
-- list always showed "just me" even after invites were accepted.
--
-- Rewrite to source teammates from `workspace_members` of every workspace
-- matching the repo. Caller is authorized as long as they are a member of
-- ANY workspace for the same repo (covers the case where invitee has their
-- own clone of the repo registered as a separate workspace).
--
-- profiles is LEFT-joined so a member without a profile row still shows up.

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
set search_path = public
as $$
  select distinct on (m.user_id)
    m.user_id,
    p.display_name,
    p.github_username
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  left join public.profiles p on p.id = m.user_id
  where w.github_owner = p_github_owner
    and w.github_repo = p_github_repo
    and m.user_id != auth.uid()
    and exists (
      select 1
      from public.workspace_members caller
      join public.workspaces cw on cw.id = caller.workspace_id
      where caller.user_id = auth.uid()
        and cw.github_owner = p_github_owner
        and cw.github_repo = p_github_repo
    )
$$;

grant execute on function public.get_repo_teammates(text, text) to authenticated;
