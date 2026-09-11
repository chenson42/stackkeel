# Portal + Admin Apps (Phase 2) — Work Log

> **Slug:** `2026-09-10-phase-2-portal-admin-apps`
> **Surface:** mixed (portal, admin, packages/ui, packages/tokens)
> **Permission(s):** existing catalog covers this (`admin.*`, `portal.home`)
> **Flag(s):** not needed (flag infrastructure exists; no new flags introduced)
> **Estimated complexity:** large
> **Pipeline mode:** Accelerated — Phases 1–3 condensed (rationale: executing the
> user-approved kit build plan, which already fixed scope, architecture, and the
> harvest sources for this phase; deviations are logged in Phase 4)

---

## Per-Phase Status

| Phase | Owner | Status | Verdict | Date |
|-------|-------|--------|---------|------|
| 1 — Functional refinement | analyst | Done (condensed) | READY WITH NOTES | 2026-09-10 |
| 2 — Architectural review | architect | Done (condensed) | Approved | 2026-09-10 |
| 3 — Technical design | tech-lead | Done (condensed) | Approved | 2026-09-10 |
| 4 — Implementation | full-stack-developer | Done | — | 2026-09-10 |
| 5 — Verification | qa | Done | PASS | 2026-09-10 |
| 6 — Shipped vs intent | analyst | Done | SHIP IT (with noted deviations) | 2026-09-10 |

---

# Phases 1–3 — Condensed (approved plan)

## Summary

Build the two web apps and their shared UI layer per the approved plan:

- **packages/tokens** — plain-TS cross-platform design tokens (Starter Blue).
- **packages/ui** — theme.css + shared components (sidebar shell, app switcher,
  user menu, page header, data table, status pill, feedback form, role matrix,
  TopNav/BottomTabs mobile-forward nav, four-state async patterns).
- **apps/portal** (:3000) — (auth) signin/totp, (app) home tile grid, account
  (profile + 2FA + devices placeholder), feedback; `/launch` destination as a
  pure function; declarative edge gate in `src/proxy.ts`.
- **apps/admin** (:3001) — sidebar shell; dashboard tiles; users (+detail: roles,
  2FA status, deactivate), roles matrix (honoring `ADMIN_PROTECTED_FEATURES`),
  flags CRUD, audit viewer, feedback triage, what's-new CRUD, email-queue viewer,
  release-notes docs viewer; 2FA + admin-feature enforced at edge AND layout.

## Placement & invariants

- Edge gates read only the session projection (never DB) — Key Invariant honored.
- Tile registries are pure data; `isVisible` uses the same `hasFeature` check the
  destination page enforces (hidden-not-denied).
- All mutations are server actions returning `ActionResult<T>`; security-sensitive
  ones write audit events via `@repo/db` helpers.
- Permissions come from `@repo/permissions` catalog; no flag gates a permission.

## Implementation order

tokens → ui → portal skeleton → portal features → admin skeleton → admin pages →
tests → workspace verification.

## Claims Ledger

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| 1 | Scope/architecture pre-approved | Verified | user-approved plan (2026-09-10) fixes this phase's scope and sources |
| 2 | `@repo/{db,auth,permissions}` export what the apps need | Verified | read `packages/*/src/index.ts` before implementation (Phase 4 notes) |

## What was NOT verified

- Per-page UX detail beyond UI-STANDARDS/UX-PATTERNS was not separately refined;
  the standards docs are treated as the Phase 1 output.

---

# Phase 4 — Implementation

## Prior-Phase Spot-Check

Plan re-read; package exports read directly before use.

## Files Created

- `packages/tokens/**` — cross-platform token objects (Starter Blue)
- `packages/ui/**` — ported ancestor ui package: theme.css rewritten
  (Starter Blue ramp + independently-derived dark scheme), `app-mark.tsx`
  replaces the ancestor glyph, two-app switcher config, new `mobile-nav.tsx`
  (TopNav/BottomTabs), all provenance comments neutralized
- `apps/portal/**` — ported ancestor portal minus its task domain: (auth),
  (member) home/whats-new/feedback, (account) + 2FA, (password-reset),
  email-verify, `/launch` (+ pure `destination.ts` + tests), NEW
  `/change-password` forced-change page and `/account/2fa/setup` alias,
  tile registry (`src/lib/tiles.ts`), kit `globals.css` with dark-mode
  variant + safe-area utilities
- `apps/admin/**` — ported ancestor admin app: users (+detail), roles
  (single-bucket role×feature matrix honoring ADMIN_PROTECTED_FEATURES),
  flags, audit (single-source reader), feedback, email-queue, whats-new +
  docs (from the ancestor portal's admin subtree), invite flow
- Per-app `AGENTS.md` shims + `CLAUDE.md` pointers

## Files Modified (outside the assigned set, justified)

- `packages/db`: added `invite_tokens` table + `0005_invites.sql`
  (`-- MODULE: core`) — the admin invite flow requires it; separate from
  password_reset_tokens by TTL/revocation semantics
- `packages/auth`: added `./config` subpath export (edge/vitest-safe narrow
  import); `oidc.test.ts` cast fixed for @types/node 24
- Both apps pinned `@types/node` ^24 — two pnpm peer-instances of next-auth
  (split by @types/node) made module augmentation apply to only one, which
  is also why the shared JWT claim types silently didn't bind in admin

## Deviations from the approved brief

1. **Portal 2FA gate is now app-wide** (was /admin-scoped in the ancestor):
   with admin split into its own app there is nothing left to path-scope,
   and the shared post-sign-in resolver already encodes the app-wide rule.
   proxy.ts mirrors it: mustChangePassword → un-enrolled-but-required →
   enrolled-but-unverified.
2. **Admin has no dashboard tile grid** — `/` redirects to `/users` (the
   ancestor's deliberate choice; sidebar covers navigation). ADMIN_TILES
   deferred; filed in TODO.
3. **Portal keeps the sidebar shell**; TopNav/BottomTabs shipped in
   @repo/ui but not yet wired as the portal's default chrome. Filed in TODO.
4. **Audit viewer reads ONE shared source** (public.audit_events + app
   column) instead of the ancestor's three-schema UNION — matches the kit's
   single-tenant data model; the N-source machinery is retained degenerate.
5. **Roles matrix is a single flat bucket** ("admin"/"member") — the kit
   ships un-namespaced shared roles; prefix buckets return when a fork adds
   namespaced roles.

## Claims Ledger

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| 1 | Both apps build clean | Verified | `next build` output for portal (18 routes) and admin (16 routes), 2026-09-10 |
| 2 | Full pipeline green | Verified | `pnpm turbo run typecheck lint build test` → 17/17 tasks successful |
| 3 | Zero ancestor-project names in apps/ + packages/{ui,tokens} | Verified | grep sweep (kindway/npvitals/huddle/presby/fpcw/westerville) → 0 hits |
| 4 | Tripwires + kit:verify pass | Verified | `kit-verify: PASSED — marker stamped for HEAD 5847f7f909` |

## What was NOT verified

- No dev-server click-through: pages were verified by typecheck/build/unit
  tests, not by driving a browser (Phase 7 e2e owns that).
- No real database: migrations (incl. new `0005_invites.sql`) have never
  run against Postgres; drizzle relational queries are exercised only
  through mocks.
- Email sending, TOTP enrollment round-trip, and OAuth flows: logic ported
  with their unit tests, but no end-to-end exercise.
- The `@source`/Tailwind cross-package caveat is encoded in both apps'
  globals.css but visual correctness of @repo/ui components was not
  eyeballed in a browser.

---

# Phase 5 — Verification (qa)

Run 2026-09-10:

| Check | Result |
|---|---|
| `pnpm install` (hooks reinstalled) | PASS |
| `pnpm turbo run typecheck lint build test` (dummy env) | PASS — 17/17 tasks |
| Unit tests | portal 384/384 · admin 151/151 · @repo/ui 57/57 · packages 107/107 |
| `next build` | portal PASS · admin PASS |
| Tripwires (`pnpm check`) | PASS (after fixing a stale example path in the trivial skill) |
| `pnpm kit:verify` | PASS — pre-push marker stamped |
| Ancestor-name sweep | 0 hits across apps/ + packages/{ui,tokens} |

## What was NOT verified

See Phase 4's list — browser click-through, real-Postgres migrations, and
end-to-end auth/email flows are Phase 7 gates.

---

# Phase 6 — Shipped vs Intent (analyst)

Shipped what the approved plan scoped for Phase 2, by porting the proven
ancestor apps and adapting them to the kit's two-app, single-tenant,
shared-catalog model. Five explicit deviations (Phase 4) — all are either
the ancestor's own deliberate choice carried forward (no admin dashboard),
a model simplification the plan itself implies (single audit source, flat
role bucket), or an improvement with its own contract test (app-wide 2FA
gate). Residual risk is concentrated in the not-verified list, all owned by
Phase 7. SHIP IT.
