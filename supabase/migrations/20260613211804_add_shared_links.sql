-- Shared Links: token-gated URLs for sharing context from private repos
create table shared_links (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default replace(gen_random_uuid()::text, '-', ''),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid references rooms(id) on delete cascade, -- null = all rooms
  user_id uuid not null references auth.users(id) on delete cascade,
  label text, -- optional human-readable label
  source_filter text not null default 'me', -- 'me' or 'all'
  expires_at timestamptz, -- null = never expires
  max_access_count int, -- null = unlimited
  access_count int not null default 0,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz
);

-- Index for fast token lookup
create index idx_shared_links_token on shared_links(token);

-- RLS
alter table shared_links enable row level security;

-- Owner can manage their links
create policy "Users can manage own shared links"
  on shared_links for all
  using (user_id = auth.uid());

-- RPC: validate and consume a shared link token (public, no auth needed)
create or replace function validate_shared_link(p_token text)
returns json
language plpgsql
security definer
as $$
declare
  v_link shared_links%rowtype;
  v_workspace workspaces%rowtype;
  v_room rooms%rowtype;
begin
  select * into v_link from shared_links where token = p_token;

  if not found then
    return json_build_object('error', 'Invalid or expired link');
  end if;

  -- Check expiry
  if v_link.expires_at is not null and v_link.expires_at < now() then
    return json_build_object('error', 'Link has expired');
  end if;

  -- Check access count
  if v_link.max_access_count is not null and v_link.access_count >= v_link.max_access_count then
    return json_build_object('error', 'Link access limit reached');
  end if;

  -- Increment access count
  update shared_links
  set access_count = access_count + 1, last_accessed_at = now()
  where id = v_link.id;

  -- Get workspace info
  select * into v_workspace from workspaces where id = v_link.workspace_id;

  -- Build result
  if v_link.room_id is not null then
    select * into v_room from rooms where id = v_link.room_id;
    return json_build_object(
      'valid', true,
      'owner', v_workspace.github_owner,
      'repo', v_workspace.github_repo,
      'branch', v_workspace.default_branch,
      'room_path', v_room.cotext_file_path,
      'source_filter', v_link.source_filter,
      'user_id', v_link.user_id,
      'label', v_link.label
    );
  else
    return json_build_object(
      'valid', true,
      'owner', v_workspace.github_owner,
      'repo', v_workspace.github_repo,
      'branch', v_workspace.default_branch,
      'room_path', null,
      'source_filter', v_link.source_filter,
      'user_id', v_link.user_id,
      'label', v_link.label
    );
  end if;
end;
$$;
