-- ============================================================
-- MindSync Track B -- managed credit charging
-- Adds default grant values and an atomic usage RPC.
-- ============================================================

alter table public.managed_credit_balances
  alter column monthly_grant_credits set default 100,
  alter column billing_state set default 'beta';

update public.managed_credit_balances
set
  monthly_grant_credits = case when monthly_grant_credits <= 0 then 100 else monthly_grant_credits end,
  balance_credits = case when balance_credits <= 0 then greatest(monthly_grant_credits, 100) else balance_credits end,
  billing_state = case when billing_state = 'beta-unmetered' then 'beta' else billing_state end
where monthly_grant_credits <= 0
   or balance_credits <= 0
   or billing_state = 'beta-unmetered';

create or replace function public.apply_managed_credit_usage(
  p_workspace_id uuid,
  p_user_id uuid,
  p_delta_credits numeric,
  p_kind text,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
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
  v_balance public.managed_credit_balances%rowtype;
  v_tx_id uuid;
begin
  if p_delta_credits = 0 then
    raise exception 'p_delta_credits must be non-zero';
  end if;

  if not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and (
        w.user_id = p_user_id
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = w.id
            and wm.user_id = p_user_id
        )
      )
  ) then
    raise exception 'workspace access denied';
  end if;

  insert into public.managed_credit_balances (
    workspace_id,
    balance_credits,
    monthly_grant_credits,
    billing_state
  )
  values (p_workspace_id, 100, 100, 'beta')
  on conflict (workspace_id) do nothing;

  select *
  into v_balance
  from public.managed_credit_balances
  where workspace_id = p_workspace_id
  for update;

  if p_delta_credits < 0 and coalesce(v_balance.balance_credits, 0) + p_delta_credits < 0 then
    raise exception 'insufficient managed credits';
  end if;

  update public.managed_credit_balances
  set
    balance_credits = balance_credits + p_delta_credits,
    lifetime_used_credits = lifetime_used_credits + greatest(-p_delta_credits, 0),
    updated_at = now()
  where workspace_id = p_workspace_id
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
    p_workspace_id,
    p_user_id,
    p_delta_credits,
    p_kind,
    p_note,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_tx_id;

  return query
  select
    v_tx_id,
    v_balance.balance_credits,
    v_balance.reserved_credits,
    v_balance.lifetime_used_credits,
    v_balance.monthly_grant_credits,
    v_balance.billing_state,
    v_balance.updated_at;
end;
$$;

grant execute on function public.apply_managed_credit_usage(uuid, uuid, numeric, text, text, jsonb) to service_role;
