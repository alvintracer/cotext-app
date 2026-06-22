-- Fix: repo teammates must always include the repo/workspace owner even if
-- an older workspace row is missing its owner membership backfill.
--
-- Symptom:
-- - invited member A can see invited member B
-- - but cannot see the original owner in the team list
--
-- Cause:
-- `get_repo_teammates` was sourcing people primarily from `workspace_members`.
-- In some older rows, the owner still exists in `workspaces.user_id` but does
-- not have a corresponding `workspace_members(role='owner')` row.
--
-- Strategy:
-- 1. idempotently backfill missing owner memberships for all workspaces
-- 2. make `get_repo_teammates` union:
--    - workspace owners from `workspaces.user_id`
--    - explicit members from `workspace_members`
--    so the owner is always present in repo-scoped team lists.

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.user_id, 'owner'
from public.workspaces w
where w.user_id is not null
on conflict (workspace_id, user_id) do nothing;

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
  with repo_workspaces as (
    select id, user_id
    from public.workspaces
    where github_owner = p_github_owner
      and github_repo = p_github_repo
  ),
  repo_people as (
    select rw.user_id
    from repo_workspaces rw
    where rw.user_id is not null
    union
    select m.user_id
    from public.workspace_members m
    join repo_workspaces rw on rw.id = m.workspace_id
  )
  select distinct on (rp.user_id)
    rp.user_id,
    p.display_name,
    p.github_username
  from repo_people rp
  left join public.profiles p on p.id = rp.user_id
  where rp.user_id != auth.uid()
    and exists (
      select 1
      from repo_workspaces rw
      left join public.workspace_members caller
        on caller.workspace_id = rw.id
       and caller.user_id = auth.uid()
      where rw.user_id = auth.uid()
         or caller.user_id is not null
    )
  order by rp.user_id;
$$;

grant execute on function public.get_repo_teammates(text, text) to authenticated;
