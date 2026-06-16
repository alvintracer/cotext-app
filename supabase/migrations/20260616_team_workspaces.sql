-- ============================================================
-- Cotext — Team workspaces: shared rooms across members (Option B)
--
-- Before: each user had their own `workspaces` row + their own `rooms`
-- rows for the same GitHub repo. Inviting someone created a fresh empty
-- workspace → teammate saw no content.
--
-- After: one canonical `workspaces` row per (github_owner, github_repo),
-- a `workspace_members` table links users to workspaces, `rooms` and
-- `shared_links` and `neural_*` become workspace-scoped (visible to any
-- member). `local_drafts` and `api_keys` stay user-scoped.
-- ============================================================

-- 1. Members table ----------------------------------------------------------

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',   -- 'owner' | 'member'
  invited_by uuid references auth.users(id),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_workspace_members_user on public.workspace_members(user_id);

alter table public.workspace_members enable row level security;

-- 2. Backfill: existing workspace owners become 'owner' members ------------

insert into public.workspace_members (workspace_id, user_id, role)
select id, user_id, 'owner'
from public.workspaces
where user_id is not null
on conflict (workspace_id, user_id) do nothing;

-- 3. Auto-merge: for repos with multiple duplicate workspaces (from the
--    old InvitePage flow), add all the involved users as members of the
--    oldest workspace in the group. Duplicates aren't deleted (avoid data
--    loss); UI may surface a cleanup affordance later.

do $$
declare
  rec record;
  canonical_id uuid;
begin
  for rec in
    select github_owner, github_repo,
           array_agg(distinct user_id) filter (where user_id is not null) as user_ids,
           (array_agg(id order by created_at asc))[1] as canonical
    from public.workspaces
    group by github_owner, github_repo
    having count(distinct user_id) filter (where user_id is not null) > 1
  loop
    canonical_id := rec.canonical;
    insert into public.workspace_members (workspace_id, user_id, role)
    select canonical_id, u, 'member'
    from unnest(rec.user_ids) as u
    on conflict (workspace_id, user_id) do nothing;
  end loop;
end $$;

-- 4. RLS policies on workspace_members -------------------------------------

drop policy if exists "Users see own memberships" on public.workspace_members;
create policy "Users see own memberships"
  on public.workspace_members for select
  using (user_id = auth.uid());

-- Members can join via accept_workspace_invite RPC (which uses security definer).
-- This policy allows the rare case of direct insert by the user themselves.
drop policy if exists "Users join via invite" on public.workspace_members;
create policy "Users join via invite"
  on public.workspace_members for insert
  with check (user_id = auth.uid());

-- Owners (only) can remove members
drop policy if exists "Owners remove members" on public.workspace_members;
create policy "Owners remove members"
  on public.workspace_members for delete
  using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- 5. workspaces RLS — replace user_id with membership ---------------------

drop policy if exists "Users can view own workspaces" on public.workspaces;
drop policy if exists "Users can manage own workspaces" on public.workspaces;
drop policy if exists "Users can insert own workspaces" on public.workspaces;
drop policy if exists "Users can update own workspaces" on public.workspaces;
drop policy if exists "Users can delete own workspaces" on public.workspaces;

create policy "Members view workspaces"
  on public.workspaces for select
  using (
    id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

create policy "Authenticated users create workspaces"
  on public.workspaces for insert
  with check (auth.uid() = user_id);

create policy "Members update workspaces"
  on public.workspaces for update
  using (
    id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

-- Only the original creator can delete (intentional friction)
create policy "Creator deletes workspace"
  on public.workspaces for delete
  using (user_id = auth.uid());

-- 6. rooms RLS — member-scoped instead of per-user ------------------------

alter table public.rooms alter column user_id drop not null;

drop policy if exists "Users can view own rooms" on public.rooms;
drop policy if exists "Users can manage own rooms" on public.rooms;
drop policy if exists "Users can insert own rooms" on public.rooms;
drop policy if exists "Users can update own rooms" on public.rooms;
drop policy if exists "Users can delete own rooms" on public.rooms;

create policy "Members read rooms"
  on public.rooms for select
  using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

create policy "Members write rooms"
  on public.rooms for insert
  with check (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

create policy "Members update rooms"
  on public.rooms for update
  using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

create policy "Members delete rooms"
  on public.rooms for delete
  using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

-- 7. neural_* RLS — members can use the shared graph ---------------------

drop policy if exists "Users manage own neural clusters" on public.neural_clusters;
create policy "Members manage neural clusters"
  on public.neural_clusters for all
  using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

drop policy if exists "Users manage own neural nodes" on public.neural_nodes;
create policy "Members manage neural nodes"
  on public.neural_nodes for all
  using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

drop policy if exists "Users manage own neural edges" on public.neural_edges;
create policy "Members manage neural edges"
  on public.neural_edges for all
  using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

-- 8. shared_links: workspace-shared resource -----------------------------

drop policy if exists "Users can manage own shared links" on public.shared_links;
drop policy if exists "Users manage own shared links" on public.shared_links;
create policy "Members manage shared links"
  on public.shared_links for all
  using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

-- 9. local_drafts and api_keys stay user-scoped (NOT changed).
--    Drafts are per-user (each member has their own unpushed work).
--    API keys are per-user issuance.

-- 10. RPC: accept_workspace_invite ---------------------------------------
--    Looks up an existing workspace for the invite's repo and adds the
--    caller as a member. Uses security definer so it can see workspaces
--    the caller isn't (yet) a member of.

create or replace function public.accept_workspace_invite(p_invite_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.workspace_invites%rowtype;
  v_user uuid;
  v_workspace_id uuid;
  v_owner_id uuid;
  v_already_member boolean;
begin
  v_user := auth.uid();
  if v_user is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  select * into v_invite from public.workspace_invites where invite_code = p_invite_code;
  if not found then
    return json_build_object('error', 'Invite not found');
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return json_build_object('error', 'Invite expired');
  end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then
    return json_build_object('error', 'Invite has reached max uses');
  end if;

  -- Prefer the inviter's workspace as canonical; otherwise pick the oldest
  -- workspace for this repo.
  select id, user_id into v_workspace_id, v_owner_id
  from public.workspaces
  where github_owner = v_invite.github_owner
    and github_repo = v_invite.github_repo
    and user_id = v_invite.created_by
  order by created_at asc
  limit 1;

  if v_workspace_id is null then
    select id, user_id into v_workspace_id, v_owner_id
    from public.workspaces
    where github_owner = v_invite.github_owner
      and github_repo = v_invite.github_repo
    order by created_at asc
    limit 1;
  end if;

  if v_workspace_id is null then
    return json_build_object('error', 'No workspace exists for this repo yet — ask the inviter to open it once');
  end if;

  -- Idempotent membership
  select exists(select 1 from public.workspace_members where workspace_id = v_workspace_id and user_id = v_user)
    into v_already_member;

  if not v_already_member then
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (v_workspace_id, v_user, 'member', v_invite.created_by);
  end if;

  update public.workspace_invites set use_count = coalesce(use_count, 0) + 1 where id = v_invite.id;

  return json_build_object(
    'ok', true,
    'workspace_id', v_workspace_id,
    'already_member', v_already_member
  );
end;
$$;

grant execute on function public.accept_workspace_invite(text) to authenticated;
