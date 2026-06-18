-- ============================================================
-- MindSync Track B — credit reservation pattern
--
-- Fixes the "extraction succeeded, charge failed → free run" race in
-- 20260618_managed_credit_usage. Instead of charging AFTER extraction,
-- the Edge Function now reserves a max amount BEFORE the call and then
-- either settles (charging actual usage) or releases (refunding all).
--
-- Lifecycle:
--   reserve_managed_credits  → balance -= max, reserved += max, tx(status='reserved', delta=-max)
--   settle_managed_credits   → reserved -= max, lifetime += actual,
--                              balance += (max - actual), tx(status='settled', delta=-actual)
--   release_managed_credits  → reserved -= max, balance += max, tx(status='released', delta=0)
--
-- All three lock the balance row FOR UPDATE so concurrent extractions
-- can't double-spend the same credits.
-- ============================================================

-- 1. Status column on the ledger
alter table public.managed_credit_transactions
  add column if not exists status text not null default 'settled',
  add column if not exists reserved_credits numeric(12,2),
  add column if not exists actual_credits numeric(12,2);

-- Backfill old rows as settled (they ARE the final, post-2026-06-18 lockdown is fresh).
update public.managed_credit_transactions
set status = 'settled'
where status is null;

create index if not exists idx_managed_credit_transactions_status
  on public.managed_credit_transactions(workspace_id, status);

-- 2. Reserve
create or replace function public.reserve_managed_credits(
  p_workspace_id uuid,
  p_user_id uuid,
  p_max_credits numeric,
  p_kind text,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
  reservation_id uuid,
  balance_credits numeric,
  reserved_credits numeric,
  lifetime_used_credits numeric,
  monthly_grant_credits numeric,
  billing_state text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance public.managed_credit_balances%rowtype;
  v_tx_id uuid;
begin
  if p_max_credits is null or p_max_credits <= 0 then
    raise exception 'p_max_credits must be > 0';
  end if;

  if not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id
      and (
        w.user_id = p_user_id
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = w.id and wm.user_id = p_user_id
        )
      )
  ) then
    raise exception 'workspace access denied';
  end if;

  insert into public.managed_credit_balances (workspace_id, balance_credits, monthly_grant_credits, billing_state)
  values (p_workspace_id, 100, 100, 'beta')
  on conflict (workspace_id) do nothing;

  select * into v_balance
  from public.managed_credit_balances
  where workspace_id = p_workspace_id
  for update;

  if coalesce(v_balance.balance_credits, 0) < p_max_credits then
    raise exception 'insufficient managed credits (need %, have %)', p_max_credits, v_balance.balance_credits;
  end if;

  update public.managed_credit_balances
  set
    balance_credits = balance_credits - p_max_credits,
    reserved_credits = reserved_credits + p_max_credits,
    updated_at = now()
  where workspace_id = p_workspace_id
  returning * into v_balance;

  insert into public.managed_credit_transactions (
    workspace_id, user_id, delta_credits, kind, status, reserved_credits, metadata
  )
  values (
    p_workspace_id, p_user_id, -p_max_credits, p_kind, 'reserved', p_max_credits,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_tx_id;

  return query select
    v_tx_id, v_balance.balance_credits, v_balance.reserved_credits,
    v_balance.lifetime_used_credits, v_balance.monthly_grant_credits,
    v_balance.billing_state, v_balance.updated_at;
end;
$$;

-- 3. Settle
create or replace function public.settle_managed_credits(
  p_reservation_id uuid,
  p_actual_credits numeric,
  p_metadata_patch jsonb default '{}'::jsonb,
  p_note text default null
)
returns table(
  reservation_id uuid,
  balance_credits numeric,
  reserved_credits numeric,
  lifetime_used_credits numeric,
  monthly_grant_credits numeric,
  billing_state text,
  updated_at timestamptz,
  charged_credits numeric,
  refunded_credits numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.managed_credit_transactions%rowtype;
  v_balance public.managed_credit_balances%rowtype;
  v_max numeric;
  v_actual numeric;
  v_refund numeric;
begin
  if p_actual_credits is null or p_actual_credits < 0 then
    raise exception 'p_actual_credits must be >= 0';
  end if;

  select * into v_tx from public.managed_credit_transactions where id = p_reservation_id for update;
  if not found then raise exception 'reservation not found'; end if;
  if v_tx.status <> 'reserved' then raise exception 'reservation already %', v_tx.status; end if;

  v_max := coalesce(v_tx.reserved_credits, -v_tx.delta_credits);
  -- Cap the actual at the reserved max — a runaway extraction can't blow past the reservation.
  v_actual := least(p_actual_credits, v_max);
  v_refund := v_max - v_actual;

  select * into v_balance from public.managed_credit_balances where workspace_id = v_tx.workspace_id for update;

  update public.managed_credit_balances
  set
    reserved_credits = greatest(reserved_credits - v_max, 0),
    balance_credits = balance_credits + v_refund,
    lifetime_used_credits = lifetime_used_credits + v_actual,
    updated_at = now()
  where workspace_id = v_tx.workspace_id
  returning * into v_balance;

  update public.managed_credit_transactions
  set
    delta_credits = -v_actual,
    actual_credits = v_actual,
    status = 'settled',
    note = coalesce(p_note, note),
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata_patch, '{}'::jsonb)
  where id = p_reservation_id;

  return query select
    p_reservation_id, v_balance.balance_credits, v_balance.reserved_credits,
    v_balance.lifetime_used_credits, v_balance.monthly_grant_credits,
    v_balance.billing_state, v_balance.updated_at,
    v_actual, v_refund;
end;
$$;

-- 4. Release (refund full reservation, no charge)
create or replace function public.release_managed_credits(
  p_reservation_id uuid,
  p_reason text default null
)
returns table(
  reservation_id uuid,
  balance_credits numeric,
  reserved_credits numeric,
  lifetime_used_credits numeric,
  monthly_grant_credits numeric,
  billing_state text,
  updated_at timestamptz,
  refunded_credits numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.managed_credit_transactions%rowtype;
  v_balance public.managed_credit_balances%rowtype;
  v_max numeric;
begin
  select * into v_tx from public.managed_credit_transactions where id = p_reservation_id for update;
  if not found then raise exception 'reservation not found'; end if;
  if v_tx.status <> 'reserved' then raise exception 'reservation already %', v_tx.status; end if;

  v_max := coalesce(v_tx.reserved_credits, -v_tx.delta_credits);

  select * into v_balance from public.managed_credit_balances where workspace_id = v_tx.workspace_id for update;

  update public.managed_credit_balances
  set
    reserved_credits = greatest(reserved_credits - v_max, 0),
    balance_credits = balance_credits + v_max,
    updated_at = now()
  where workspace_id = v_tx.workspace_id
  returning * into v_balance;

  update public.managed_credit_transactions
  set
    delta_credits = 0,
    actual_credits = 0,
    status = 'released',
    note = coalesce(p_reason, note)
  where id = p_reservation_id;

  return query select
    p_reservation_id, v_balance.balance_credits, v_balance.reserved_credits,
    v_balance.lifetime_used_credits, v_balance.monthly_grant_credits,
    v_balance.billing_state, v_balance.updated_at, v_max;
end;
$$;

-- 5. Permissions — only service_role (Edge Function uses admin client)
revoke execute on function public.reserve_managed_credits(uuid, uuid, numeric, text, jsonb) from public;
revoke execute on function public.reserve_managed_credits(uuid, uuid, numeric, text, jsonb) from anon;
revoke execute on function public.reserve_managed_credits(uuid, uuid, numeric, text, jsonb) from authenticated;
grant   execute on function public.reserve_managed_credits(uuid, uuid, numeric, text, jsonb) to service_role;

revoke execute on function public.settle_managed_credits(uuid, numeric, jsonb, text) from public;
revoke execute on function public.settle_managed_credits(uuid, numeric, jsonb, text) from anon;
revoke execute on function public.settle_managed_credits(uuid, numeric, jsonb, text) from authenticated;
grant   execute on function public.settle_managed_credits(uuid, numeric, jsonb, text) to service_role;

revoke execute on function public.release_managed_credits(uuid, text) from public;
revoke execute on function public.release_managed_credits(uuid, text) from anon;
revoke execute on function public.release_managed_credits(uuid, text) from authenticated;
grant   execute on function public.release_managed_credits(uuid, text) to service_role;
