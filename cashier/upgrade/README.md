# Cashier Ledger — staged upgrade (not deployed)

This work continues the existing GitHub Pages site in `cashier/` and the existing Supabase project `Cashier_Ledger`. It does not create a second product, replace the legacy PWA, or modify old customers/journal/invitation rows.

## Files and ordering

1. `20260923_portal_and_audit.sql`: no-email, one-customer portal codes; private statements and disputes; database-side audit log. Old client invitations remain untouched.
2. `20260923_multicurrency_cashbox.sql`: tenant-scoped staff roles and read policies; cash/wallet accounts; immutable payment parts; pending manual confirmations; frozen FX + USDT price; balances and daily closeout.
3. `20260923_safety_hardening.sql`: safe wallet-aware reversals, staff revocation, prevent post-close movements, and customer breakdown of all payment legs.

All are **additive**, except the new `ledger_payments.state` check is widened to allow `reversed` on the new table only. No existing app data is deleted or overwritten. The owner must set explicit opening balances for legacy wallet cash, since old journal entries have no wallet/channel reference.

## Verified in a single rolled-back transaction against the existing schema

- `BEGIN;` → migrations 1, 2, 3 → `qa_transaction_rollback.sql` → `qa_reversals_rollback.sql` → `ROLLBACK;`
- 19 named functional checks passed: split USD/SYP/USDT at locked FX; no debt decrease while pending; manual confirm exactly once; idempotent retries; rejection; separate wallets; closeout variance and duplicate rejection; blocked posting after closeout; reversals correct the debt and each wallet without erasing history; staff disable; scoped customer statements and disputes; portal code rotation; server audit.
- Separately: migrations 1, 2, 3 → `qa_rls_rollback.sql` → `ROLLBACK;`: real PostgreSQL `authenticated` and `anon` role tests passed for assigned staff and cross-tenant isolation.
- HTML legacy inline JS, v2 JS, customer portal inline JS and service worker all passed JavaScript syntax checks; 0 missing referenced DOM IDs, 0 missing inline event handlers, 0 duplicate DOM IDs. The old idempotent sync function is retained. The staged PWA cache version is `cashier-v13`.

## Release gate — still outstanding

- **No migration has been applied to the live database**, and no commit has been merged to `main`, deployed, or linked into public navigation.
- Perform real mobile and desktop browser smoke tests with separate owner/employee/customer sessions. The owner should complete the flow: create each cash account, add a legacy opening balance, prepare a three-leg payment, manually confirm receipts, retry confirmation, reverse it, close the day, rotate a customer code, file a customer dispute, and revoke a staff member. Test a customer's attempted access using a different code/account.
- Browser tests should also cover legacy PWA/offline sync regression and a cache upgrade from v12 to v13. New wallet payments require an online authenticated session by design; they never enter the old offline financial queue.
- Fix or review live Auth security warnings, especially Supabase leaked-password protection currently disabled. Existing invitation RPC security-definer functions have explicit owner checks but need a focused security review before external release.
- Decide whether legacy unallocated journal expenses should map to new wallet adjustments automatically; current new cashbox starts from explicit opening balance and confirmed v2 flows.
- If source repository Pages deploys from unexpected branches or PRs, verify and disable that action before exposing this draft branch. A draft PR does not authorize merging or release.

See `customer-portal.html` for the code-only customer view and `ledger-v2.js` for the integrated mobile-first owner/staff controls. Do not publish until these release-gate checks are complete.
