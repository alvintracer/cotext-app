-- API Keys: per-workspace keys for remote MCP / ChatGPT Actions / Claude.ai
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  key text unique not null default 'ctx_' || replace(gen_random_uuid()::text, '-', ''),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'default',
  scopes text[] not null default array['read', 'write'],
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz  -- null = active
);

create index idx_api_keys_key on api_keys(key);

alter table api_keys enable row level security;

create policy "Users can manage own API keys"
  on api_keys for all
  using (user_id = auth.uid());

-- RPC: validate API key (no auth needed, security definer)
create or replace function validate_api_key(p_key text)
returns json
language plpgsql
security definer
as $$
declare
  v_api api_keys%rowtype;
  v_ws workspaces%rowtype;
begin
  select * into v_api from api_keys where key = p_key and revoked_at is null;

  if not found then
    return json_build_object('error', 'Invalid or revoked API key');
  end if;

  update api_keys set last_used_at = now() where id = v_api.id;

  select * into v_ws from workspaces where id = v_api.workspace_id;

  return json_build_object(
    'valid', true,
    'workspace_id', v_api.workspace_id,
    'user_id', v_api.user_id,
    'owner', v_ws.github_owner,
    'repo', v_ws.github_repo,
    'branch', v_ws.default_branch,
    'scopes', v_api.scopes
  );
end;
$$;
