-- Fix: teammate list should not show "Unknown member" when the user has
-- already written blocks with a valid GitHub identity.
--
-- Cause:
-- - chat block authorship comes from block metadata / auth user metadata
-- - teammate list comes from `profiles`
-- - some older users have sparse `profiles` rows even though their
--   `github_connections` or `auth.users.raw_user_meta_data` has the identity
--
-- Strategy:
-- 1. backfill / normalize `profiles` from auth + github_connections
-- 2. make get_repo_teammates resolve display/github name from:
--    profiles -> github_connections -> auth.users metadata -> email local-part

insert into public.profiles (id, email, display_name, github_username)
select
  au.id,
  au.email,
  coalesce(
    nullif(au.raw_user_meta_data->>'name', ''),
    nullif(au.raw_user_meta_data->>'user_name', ''),
    split_part(coalesce(au.email, ''), '@', 1)
  ) as display_name,
  coalesce(
    nullif(gc.github_username, ''),
    nullif(au.raw_user_meta_data->>'user_name', '')
  ) as github_username
from auth.users au
left join public.github_connections gc on gc.user_id = au.id
where not exists (
  select 1 from public.profiles p where p.id = au.id
);

update public.profiles p
set
  email = coalesce(p.email, au.email),
  display_name = coalesce(
    nullif(p.display_name, ''),
    nullif(au.raw_user_meta_data->>'name', ''),
    nullif(au.raw_user_meta_data->>'user_name', ''),
    split_part(coalesce(au.email, ''), '@', 1)
  ),
  github_username = coalesce(
    nullif(p.github_username, ''),
    nullif(gc.github_username, ''),
    nullif(au.raw_user_meta_data->>'user_name', '')
  ),
  updated_at = now()
from auth.users au
left join public.github_connections gc on gc.user_id = au.id
where p.id = au.id
  and (
    p.email is null
    or nullif(p.display_name, '') is null
    or nullif(p.github_username, '') is null
  );

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
    coalesce(
      nullif(p.display_name, ''),
      nullif(au.raw_user_meta_data->>'name', ''),
      nullif(au.raw_user_meta_data->>'user_name', ''),
      nullif(gc.github_username, ''),
      split_part(coalesce(p.email, au.email, ''), '@', 1)
    ) as display_name,
    coalesce(
      nullif(p.github_username, ''),
      nullif(gc.github_username, ''),
      nullif(au.raw_user_meta_data->>'user_name', '')
    ) as github_username
  from repo_people rp
  left join public.profiles p on p.id = rp.user_id
  left join public.github_connections gc on gc.user_id = rp.user_id
  left join auth.users au on au.id = rp.user_id
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
