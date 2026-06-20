-- Fix: auto-add workspace creator to workspace_members + fix SELECT RLS
-- + fix managed_credit_balances trigger
--
-- Problem chain on .insert().select() for workspaces:
-- 1. INSERT policy passes (auth.uid() = user_id) ✓
-- 2. AFTER INSERT trigger fires ensure_managed_credit_balance_for_workspace()
--    → INSERT into managed_credit_balances → NO INSERT policy → 403 ✗
-- 3. PostgREST RETURNING checks SELECT policy → no membership yet → 403 ✗
--
-- Fixes:
-- A) ensure_managed_credit_balance_for_workspace → SECURITY DEFINER
-- B) handle_new_workspace trigger → auto-add creator as owner member
-- C) SELECT policy → allow user_id=auth.uid() fallback for creator
-- D) Remove duplicate INSERT policy

-- A) Credit balance trigger — needs SECURITY DEFINER to bypass RLS
create or replace function public.ensure_managed_credit_balance_for_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.managed_credit_balances (workspace_id)
  values (NEW.id)
  on conflict (workspace_id) do nothing;
  return NEW;
end;
$$;

-- B) Auto-add creator as owner member
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

-- C) SELECT policy: members OR creator
drop policy if exists "Members view workspaces" on public.workspaces;
create policy "Members view workspaces"
  on public.workspaces for select
  using (
    user_id = auth.uid()
    or id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

-- D) Remove duplicate INSERT policy from initial schema
drop policy if exists "Users can create workspaces" on public.workspaces;
