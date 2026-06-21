-- ============================================================
-- NOWPayments top-up flow for managed credits
-- Creates order ledger + idempotent credit application RPC.
-- ============================================================

create table if not exists public.managed_credit_orders (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'nowpayments',
  provider_order_id text not null unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  pack_id text not null,
  credits numeric(12,2) not null check (credits > 0),
  price_amount numeric(12,2) not null check (price_amount > 0),
  price_currency text not null default 'usd',
  provider_invoice_id text,
  provider_payment_id text,
  invoice_url text,
  status text not null default 'pending',
  credited_at timestamptz,
  credit_transaction_id uuid references public.managed_credit_transactions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_managed_credit_orders_workspace_created
  on public.managed_credit_orders(workspace_id, created_at desc);

create index if not exists idx_managed_credit_orders_provider_payment
  on public.managed_credit_orders(provider, provider_payment_id);

alter table public.managed_credit_orders enable row level security;

drop policy if exists "Members read managed credit orders" on public.managed_credit_orders;
create policy "Members read managed credit orders"
  on public.managed_credit_orders for select
  using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

create or replace function public.touch_managed_credit_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_managed_credit_orders_updated_at on public.managed_credit_orders;
create trigger trg_managed_credit_orders_updated_at
before update on public.managed_credit_orders
for each row execute function public.touch_managed_credit_orders_updated_at();

create or replace function public.apply_nowpayments_credit_order(
  p_provider_order_id text,
  p_provider_payment_id text default null,
  p_provider_invoice_id text default null,
  p_status text default null,
  p_payload jsonb default '{}'::jsonb
)
returns table(
  order_id uuid,
  applied boolean,
  transaction_id uuid,
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
  v_order public.managed_credit_orders%rowtype;
  v_balance public.managed_credit_balances%rowtype;
  v_tx_id uuid;
  v_applied boolean := false;
  v_effective_status text := coalesce(nullif(trim(p_status), ''), 'pending');
begin
  select *
  into v_order
  from public.managed_credit_orders
  where provider = 'nowpayments'
    and provider_order_id = p_provider_order_id
  for update;

  if not found then
    raise exception 'managed credit order not found';
  end if;

  update public.managed_credit_orders
  set
    provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
    provider_invoice_id = coalesce(p_provider_invoice_id, provider_invoice_id),
    status = v_effective_status,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'last_ipn',
      coalesce(p_payload, '{}'::jsonb)
    ),
    updated_at = now()
  where id = v_order.id
  returning *
  into v_order;

  insert into public.managed_credit_balances (
    workspace_id,
    balance_credits,
    monthly_grant_credits,
    billing_state
  )
  values (v_order.workspace_id, 100, 100, 'beta')
  on conflict (workspace_id) do nothing;

  select *
  into v_balance
  from public.managed_credit_balances
  where workspace_id = v_order.workspace_id
  for update;

  if v_order.credited_at is null and lower(v_effective_status) = 'finished' then
    update public.managed_credit_balances
    set
      balance_credits = balance_credits + v_order.credits,
      updated_at = now()
    where workspace_id = v_order.workspace_id
    returning *
    into v_balance;

    insert into public.managed_credit_transactions (
      workspace_id,
      user_id,
      delta_credits,
      kind,
      note,
      metadata
    )
    values (
      v_order.workspace_id,
      v_order.user_id,
      v_order.credits,
      'managed_topup_nowpayments',
      format('NOWPayments top-up (%s)', v_order.pack_id),
      jsonb_build_object(
        'provider', 'nowpayments',
        'provider_order_id', v_order.provider_order_id,
        'provider_payment_id', coalesce(p_provider_payment_id, v_order.provider_payment_id),
        'provider_invoice_id', coalesce(p_provider_invoice_id, v_order.provider_invoice_id),
        'pack_id', v_order.pack_id,
        'payload', coalesce(p_payload, '{}'::jsonb)
      )
    )
    returning id
    into v_tx_id;

    update public.managed_credit_orders
    set
      credited_at = now(),
      credit_transaction_id = v_tx_id,
      updated_at = now()
    where id = v_order.id
    returning *
    into v_order;

    v_applied := true;
  else
    v_tx_id := v_order.credit_transaction_id;
  end if;

  if v_balance.workspace_id is null then
    select *
    into v_balance
    from public.managed_credit_balances
    where workspace_id = v_order.workspace_id;
  end if;

  return query
  select
    v_order.id,
    v_applied,
    v_tx_id,
    v_balance.balance_credits,
    v_balance.reserved_credits,
    v_balance.lifetime_used_credits,
    v_balance.monthly_grant_credits,
    v_balance.billing_state,
    v_balance.updated_at;
end;
$$;

revoke execute on function public.apply_nowpayments_credit_order(text, text, text, text, jsonb) from public;
revoke execute on function public.apply_nowpayments_credit_order(text, text, text, text, jsonb) from anon;
revoke execute on function public.apply_nowpayments_credit_order(text, text, text, text, jsonb) from authenticated;
grant execute on function public.apply_nowpayments_credit_order(text, text, text, text, jsonb) to service_role;
