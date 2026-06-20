-- Fix: auto-add workspace creator to workspace_members
-- Without this trigger, the INSERT succeeds but the subsequent .select()
-- fails because the SELECT RLS policy requires membership.

create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (NEW.id, NEW.user_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return NEW;
end;
$$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
  after insert on public.workspaces
  for each row
  execute function public.handle_new_workspace();
