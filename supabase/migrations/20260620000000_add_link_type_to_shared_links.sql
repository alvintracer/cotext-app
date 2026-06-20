-- shared_links: support graph-snapshot links (NEURAL_INDEX.md) in addition to
-- room-context links. The graph variant is what web-agent users want — every
-- new chat in a ChatGPT/Claude Project can fetch the latest graph from the
-- same stable URL without re-uploading a file.

alter table shared_links
  add column if not exists link_type text not null default 'context'
    check (link_type in ('context', 'graph'));

create index if not exists idx_shared_links_type on shared_links(link_type);

-- Update validate_shared_link to surface link_type so the edge function can
-- branch on it. Drop and recreate so we can change the return shape safely.
drop function if exists validate_shared_link(text);

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

  if v_link.expires_at is not null and v_link.expires_at < now() then
    return json_build_object('error', 'Link has expired');
  end if;

  if v_link.max_access_count is not null and v_link.access_count >= v_link.max_access_count then
    return json_build_object('error', 'Link access limit reached');
  end if;

  update shared_links
  set access_count = access_count + 1, last_accessed_at = now()
  where id = v_link.id;

  select * into v_workspace from workspaces where id = v_link.workspace_id;

  -- Graph links ignore room_path and source_filter (they always serve the
  -- workspace-wide NEURAL_INDEX.md, which the compiler keeps current on push).
  if v_link.link_type = 'graph' then
    return json_build_object(
      'valid', true,
      'link_type', 'graph',
      'owner', v_workspace.github_owner,
      'repo', v_workspace.github_repo,
      'branch', v_workspace.default_branch,
      'user_id', v_link.user_id,
      'label', v_link.label
    );
  end if;

  if v_link.room_id is not null then
    select * into v_room from rooms where id = v_link.room_id;
    return json_build_object(
      'valid', true,
      'link_type', 'context',
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
      'link_type', 'context',
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
