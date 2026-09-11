# Playwright E2E Smoke Suites (Phase 7) — Work Log

- **Date:** 2026-09-11
- **Classification:** Feature
- **Source:** Phase 7 verification (docs/TODO.md); `.github/workflows/e2e.yml` shipped in
  Phase 5 expecting `apps/*/e2e` suites to exist.

## Per-Phase Status

| Phase | Owner | Status |
|---|---|---|
| 1 Functional refinement | analyst | Done (accelerated — scope fixed by the e2e.yml contract + Phase 7 TODO) |
| 2 Architectural review | architect | Done (accelerated — layout dictated by e2e.yml: per-app `e2e/` + `playwright.config.ts`, `pnpm --filter <app> exec playwright test`) |
| 3 Technical design | tech-lead | Done (below) |
| 4 Implementation | full-stack-developer | Done |
| 5 Verification | qa | Done |
| 6 Shipped vs intent | analyst | Done — SHIP WITH NOTES |

# Phase 3 — Technical Design

**Contract (from `.github/workflows/e2e.yml`, Verified):** CI runs
`pnpm --filter <app> exec playwright test` per app that has an `e2e/` dir, with only
`DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST` env. Therefore each app's
`playwright.config.ts` must (a) default every other required env var deterministically
(TOTP key, AUTH_URL, seed credentials), and (b) seed its own e2e users — the workflow
runs only `db:seed`, not an e2e seed.

**Users** (created by `packages/db/src/seed-e2e.ts`, idempotent, all `@example.com`):
- `e2e-member@example.com` — member role, password, no TOTP → portal suite.
- `e2e-admin@example.com` — admin role, password, TOTP **enrolled** with a
  deterministic base32 secret so tests can mint codes via otplib → admin suite.
- `e2e-admin-fresh@example.com` — admin role, password, **no** TOTP → proves the
  `/setup-mfa` forced-enrollment redirect (admin's atomic-TOTP model).

**Auth in tests:** claudecode's storage-state global-setup pattern, ported per app:
CSRF → `POST /api/auth/callback/credentials` (NextAuth 5 always answers 302 —
DECISION-020 upstream; do not check `.ok()`) → session verify → save storageState.
Admin's atomic `authorize()` additionally takes `totpCode` in the same POST
(Verified: `apps/admin/src/auth.ts` credentials fields + the two-submit MFA_REQUIRED
signal); the admin global-setup mints the code with otplib from the seeded secret.

**TOTP secret encryption:** `seed-e2e.ts` must write `user_totp.secret_ciphertext` in
exactly `packages/auth/src/two-factor.ts`'s AES-256-GCM iv‖tag‖ct layout. `@repo/db`
cannot depend on `@repo/auth` (cycle), so the ~15-line encrypt is mirrored in the seed
with a pointer comment both ways.

**Suites (smoke-level):**
- Portal `e2e/auth.spec.ts` — signin renders; wrong password → generic `role=alert`
  error (no enumeration); UI login lands on `/home` via `/launch`; unauth `/home` →
  `/signin?callbackUrl=`.
- Portal `e2e/member.spec.ts` (member storageState) — `/home` renders; `/account`
  renders; `/support` files a ticket and shows it in "My tickets".
- Portal `e2e/security.spec.ts` — security headers present on `/signin`;
  `/api/health` returns `ok:true`.
- Admin `e2e/auth.spec.ts` — unauth `/users` → `/signin`; fresh admin (no TOTP) UI
  login → forced to `/setup-mfa`; enrolled admin storageState reaches `/users`.
- Admin `e2e/admin.spec.ts` (admin storageState) — `/users` lists seeded users;
  member detail page role toggle round-trip; audit row for the toggle asserted via a
  direct DB query (`@neondatabase/serverless`, admin devDep).

**DB isolation:** claudecode's `runDbIsolationGuard` ported (E2E_DATABASE_URL /
E2E_ALLOW_SHARED_DB / CI hard-block on shared Neon hosts) into each global-setup.

# Phase 4 — Implementation

Implemented per the design. Notes:
- Configs default `AUTH_SECRET`, `AUTH_TOTP_ENCRYPTION_KEY` (deterministic e2e-only
  values), `AUTH_URL`/`NEXT_PUBLIC_APP_URL`, seed credentials, and
  `RATE_LIMIT_LOGIN_MAX`/`RATE_LIMIT_MFA_MAX` elevation for the admin app (its
  authorize() submits twice per TOTP login — its own header comment calls this out).
- `webServer: pnpm dev` with `reuseExistingServer: !CI` (claudecode's shape); the
  global-setup runs `pnpm --filter @repo/db db:seed && db:seed:e2e` so CI needs no
  workflow change.
- Storage-state files under `e2e/support/.auth/` (gitignored per app).

## Claims Ledger

| # | Claim | Class | Evidence |
|---|---|---|---|
| 1 | e2e.yml invokes per-app playwright with only DATABASE_URL/AUTH_SECRET/AUTH_TRUST_HOST | Verified | `.github/workflows/e2e.yml` L57-67 read this session |
| 2 | Admin authorize() accepts email+password+totpCode atomically and signals MFA_REQUIRED on bare submit | Verified | `apps/admin/src/auth.ts` L107-193 |
| 3 | Seed-e2e's encrypt matches packages/auth two-factor layout | Verified | mirror read of `packages/auth/src/two-factor.ts` `encryptSecret()`; asserted live by the admin login test succeeding (decrypt happens server-side) |
| 4 | Both suites pass against a live Neon database | Verified | local runs recorded in Phase 5 |

# Phase 5 — Verification (qa)

- Portal suite: **9/9 passed** (14.9s first green run; re-run from cold `.auth/`
  9/9 in 16.7s) against the live `stackkeel-dev` Neon DB.
- Admin suite: **4/4 passed** (15.1s, cold `.auth/`) — includes the atomic
  email+password+totpCode login through the real authorize(), which live-validates
  the seed's mirrored AES-GCM layout (server decrypted what the seed wrote).
- Iteration record (fix-forward, all test-side or dependency-side):
  1. Three portal failures on first run — two strict-mode violations (Next route
     announcer duplicates page text) and one test written against the retired
     `/account` page (it redirects to `/home` by design; account settings is a
     dialog). Tests corrected to the real contracts.
  2. otplib v13 has no `authenticator` namespace — switched to `generateSync`.
  3. Adding `@playwright/test` to the two apps split `next`/`next-auth` into a
     second pnpm peer-instance (same failure class as Phase 4's `@types/react`
     pin), breaking admin's auth unit-test mocks. Fixed by hoisting
     `@playwright/test` to the workspace root: lockfile now carries exactly ONE
     next-auth instance for every importer; `pnpm exec` resolves the root bin and
     tsc resolves the types by upward walk. Both suites re-run green after.
  4. `check-identity-files` (Phase 5 tripwire) flagged the kit name inside the
     configs' TOTP key filler — renamed the filler rather than registering.
- Workspace: `pnpm turbo run typecheck lint test --filter=portal --filter=admin
  --filter=@repo/db` 8/8 green (after adding `bcryptjs` as a real dep of
  `@repo/db` for the seed); tripwires 6/6; `pnpm kit:verify` **PASSED** (marker
  stamped); ancestor-name sweep over every new file: 0 hits.

## What was NOT verified

- The e2e workflow's CI execution (needs `NEON_API_KEY`/`NEON_PROJECT_ID` secrets on
  the repo; first real run happens on the next PR after secrets are added).
- WebKit/Firefox engines (chromium only, per the smoke scope).
- Feedback prompt-card submission path (the home card renders on a day-boundary
  schedule; the ticket-filing flow covers the analogous form round-trip). Filed in
  TODO.
- Cross-app SSO cookie sharing between portal and admin under one domain (needs a
  deployed environment with `AUTH_COOKIE_DOMAIN`).

# Phase 6 — Shipped vs Intent (analyst)

Shipped what the Phase 7 TODO scoped: real browser suites for both web apps,
self-seeding, runnable locally and under the existing untouched workflow. Notes → the
three NOT-verified TODOs above. SHIP WITH NOTES.
