-- ============================================================
-- MindSync Track B — managed credits tables
-- Workspace-scoped balance + transaction ledger.
-- Current phase: beta-unmetered (readable UI, no automatic deduction yet).
-- ============================================================

create table if not exists public.managed_credit_balances (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  balance_credits numeric(12,2) not null default 0,
  reserved_credits numeric(12,2) not null default 0,
  lifetime_used_credits numeric(12,2) not null default 0,
  monthly_grant_credits numeric(12,2) not null default 0,
  billing_state text not null default 'beta-unmetered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.managed_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  delta_credits numeric(12,2) not null,
  kind text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_managed_credit_transactions_workspace_created
  on public.managed_credit_transactions(workspace_id, created_at desc);

alter table public.managed_credit_balances enable row level security;
alter table public.managed_credit_transactions enable row level security;

drop policy if exists "Members read managed balances" on public.managed_credit_balances;
create policy "Members read managed balances"
  on public.managed_credit_balances for select
  using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

drop policy if exists "Members read managed transactions" on public.managed_credit_transactions;
create policy "Members read managed transactions"
  on public.managed_credit_transactions for select
  using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

create or replace function public.touch_managed_credit_balances_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_managed_credit_balances_updated_at on public.managed_credit_balances;
create trigger trg_managed_credit_balances_updated_at
before update on public.managed_credit_balances
for each row execute function public.touch_managed_credit_balances_updated_at();

create or replace function public.ensure_managed_credit_balance_for_workspace()
returns trigger
language plpgsql
as $$
begin
  insert into public.managed_credit_balances (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_workspaces_init_managed_credits on public.workspaces;
create trigger trg_workspaces_init_managed_credits
after insert on public.workspaces
for each row execute function public.ensure_managed_credit_balance_for_workspace();

insert into public.managed_credit_balances (workspace_id)
select id
from public.workspaces
on conflict (workspace_id) do nothing;
