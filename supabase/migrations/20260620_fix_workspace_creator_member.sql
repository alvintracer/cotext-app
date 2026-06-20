-- Fix: auto-add workspace creator to workspace_members + fix SELECT RLS
--
-- Problem: .insert().select() on workspaces returns 403 because:
-- 1. INSERT policy passes (auth.uid() = user_id) ✓
-- 2. PostgREST uses INSERT...RETURNING which also checks SELECT policy
-- 3. SELECT policy requires workspace_members membership
-- 4. AFTER INSERT trigger fires too late (after RETURNING evaluates)
--
-- Solution:
-- A) Trigger to auto-add creator as owner member (for future SELECTs)
-- B) SELECT policy also allows user_id = auth.uid() (creator fallback)
-- C) Remove duplicate INSERT policy from initial schema

-- A) Auto-add creator trigger
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

-- B) SELECT policy: members OR creator
drop policy if exists "Members view workspaces" on public.workspaces;
create policy "Members view workspaces"
  on public.workspaces for select
  using (
    user_id = auth.uid()
    or id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

-- C) Remove duplicate INSERT policy from initial schema
drop policy if exists "Users can create workspaces" on public.workspaces;
