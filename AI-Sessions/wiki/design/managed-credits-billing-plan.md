# Managed Credits Billing Plan

## Summary

- Current recommendation: `NOWPayments invoice + IPN webhook + Supabase Edge Function`
- Reason for the change:
  - Stripe is not a viable direct onboarding path for a Korea-based operator in this project context.
  - NOWPayments works as a hosted checkout rail that supports crypto and can expose card-oriented checkout depending on merchant-side NOWPayments settings.
  - Cotext already has the workspace-scoped credit ledger and managed debit flow, so the missing part was purchase attribution and top-up settlement.

## What Cotext already had

Before this billing work, Cotext already had:

- `managed_credit_balances`
- `managed_credit_transactions`
- server-side debit on managed extraction
- server-side debit on managed agent chat
- `ManagedCreditsPanel` balance UI

So the billing problem was not generic architecture.

The real missing pieces were:

- checkout session creation
- order tracking
- verified payment callback
- idempotent credit top-up

## Current implementation

### Checkout flow

Cotext now uses the hosted invoice flow from NOWPayments:

1. User opens `ManagedCreditsPanel`
2. User chooses a fixed credit pack
3. Browser calls `nowpayments-create-invoice`
4. Edge Function creates a NOWPayments invoice with:
   - `price_amount`
   - `price_currency=usd`
   - `order_id`
   - `ipn_callback_url`
   - `success_url`
   - `cancel_url`
5. Browser redirects to returned `invoice_url`
6. NOWPayments sends IPN callback to `nowpayments-ipn`
7. IPN signature is verified with `NOWPAYMENTS_IPN_SECRET`
8. Supabase RPC applies the top-up exactly once
9. Workspace balance and ledger become readable through existing UI

### Fixed packs

Current packs are intentionally fixed:

- `starter`: 500 credits / $10
- `growth`: 2500 credits / $39
- `team`: 8000 credits / $99

Why fixed packs first:

- simpler pricing
- simpler reconciliation
- easier audit trail
- less abuse surface

## New backend pieces

### Edge Functions

- `nowpayments-create-invoice`
  - validates workspace membership
  - resolves pack config
  - creates NOWPayments invoice
  - stores local order row before redirect

- `nowpayments-ipn`
  - `verify_jwt = false`
  - accepts external NOWPayments callback
  - verifies `x-nowpayments-sig`
  - forwards the event to an idempotent SQL RPC

### SQL additions

- `managed_credit_orders`
  - stores provider order id, invoice id, workspace id, pack id, credits, price, status
  - keeps top-up attribution separate from usage ledger

- `apply_nowpayments_credit_order(...)`
  - server-only RPC
  - updates order status
  - credits workspace only once when status becomes `finished`
  - writes `managed_topup_nowpayments` ledger row

## Why this shape fits Cotext

- It preserves the existing workspace-scoped credit model.
- It keeps actual credit mutation on the server only.
- It avoids trusting the browser for final billing state.
- It supports idempotent retries because IPN callbacks can repeat.

## Operational notes

- `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET` are required on the server.
- `nowpayments-ipn` must stay externally reachable without Supabase JWT verification.
- Remote DB schema was applied directly through Supabase Management API, not broad `supabase db push`, because this repo still carries the known migration-history mismatch risk from older migrations.

## Caveats

- Card availability is not guaranteed purely by code. It depends on how NOWPayments account-side checkout options are configured.
- The current implementation treats `finished` as the crediting state. Other statuses are stored but do not top up credits.
- Refund and dispute handling is not automated yet.

## Next recommended steps

### Phase 1 follow-up

- add purchase history UI from `managed_credit_orders`
- show pending / finished / expired order states
- add clearer success / cancel banners after redirect return

### Phase 2

- add refund/reversal handling for `refunded` or failed settlement paths
- add admin/manual credit adjustment tooling
- add pack management from config or DB instead of hardcoded constants

### Phase 3

- add low-balance warning
- optionally add auto top-up logic if NOWPayments workflow proves reliable enough

## Source of truth

Relevant implementation files:

- `src/components/ManagedCreditsPanel.tsx`
- `src/lib/billing/packs.ts`
- `src/lib/supabase/functions.ts`
- `supabase/functions/nowpayments-create-invoice/index.ts`
- `supabase/functions/nowpayments-ipn/index.ts`
- `supabase/migrations/20260621000000_nowpayments_managed_billing.sql`
