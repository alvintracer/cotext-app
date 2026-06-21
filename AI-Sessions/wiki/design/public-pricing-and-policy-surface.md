# Design: Public Pricing and Policy Surface

Related: [[AI-Sessions/wiki/design/cotext-brand-and-landing]], [[AI-Sessions/wiki/design/managed-credits-billing-plan]], [[AI-Sessions/wiki/projects/cotext_mvp]]

## Summary

Cotext now exposes a public pricing and policy layer in the same design language as the main landing page.

New public routes:

- `/pricing`
- `/terms`
- `/privacy`
- `/refund-policy`

The goal is to make managed billing understandable before a user ever enters the app, while keeping the UI visually consistent with the existing landing surface.

## What shipped

- Shared public marketing shell
  - `src/components/site/MarketingShell.tsx`
  - reuses the landing visual language, theme toggle, language toggle, brand, and CTA structure
- Pricing page
  - `src/pages/PricingPage.tsx`
  - light/dark mode compatible
  - EN/KO copy built in
  - shows live managed credit packs from `src/lib/billing/packs.ts`
- Legal pages
  - `src/pages/TermsPage.tsx`
  - `src/pages/PrivacyPage.tsx`
  - `src/pages/RefundPolicyPage.tsx`
- Router wiring
  - `src/App.tsx`
- Landing integration
  - top navigation now includes `Pricing`
  - footer now links to Pricing, Terms of Service, Privacy Policy, and Refund Policy
- Shared styling extensions
  - `src/styles/landing.css`

## Pricing content rules

The pricing page is intentionally tied to real product behavior rather than generic SaaS copy.

- Live pack definitions:
  - `Starter`: 500 credits / $10
  - `Growth`: 2500 credits / $39
  - `Team`: 8000 credits / $99
- Current beta metering is explained in plain language:
  - managed extraction and managed agent chat are currently estimated at roughly `1 credit / 12,000 input characters`
  - minimum `1 credit` per run
- The page explains what credits are used for:
  - MindSync extraction
  - managed agent chat
  - shared team workspace usage
- It also keeps the billing caveats explicit:
  - BYOK is still available
  - credits are workspace-scoped
  - hosted checkout currently goes through NOWPayments
  - card availability can depend on region and NOWPayments checkout options

## Legal copy direction

The three public policy pages are pragmatic product-policy pages, not boilerplate placeholders.

- Terms of Service
  - defines service scope, account responsibility, content ownership, managed/BYOK distinction, acceptable use, billing caveats, availability, and termination
- Privacy Policy
  - explains account/workspace/repository/file-processing data paths, BYOK vs managed processing, third-party services, retention, security, and user choices
- Refund Policy
  - explains that managed credits are prepaid digital balances
  - used credits are generally non-refundable
  - duplicate payment / failed application / fully unused prompt requests may be reviewed
  - NOWPayments rail limitations are called out explicitly

## Verification

- `npm run build` passed after adding the new routes and pages.

## Follow-up options

- Add a purchase-history block for public trust, driven from `managed_credit_orders`
- Add a FAQ entry for workspace invitations and who pays in shared workspaces
- Add a stronger comparison between BYOK and managed mode if onboarding questions repeat
