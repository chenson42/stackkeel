# Phase 3 — Helpdesk, Brand Engine, Maintenance Plumbing — Work Log

> **Slug:** `2026-09-11-phase-3-helpdesk-brand-maintenance`
> **Surface:** mixed (packages/brand new, packages/db additions, portal, admin, scripts)
> **Permission(s):** existing `admin.tickets`, `admin.branding`, `tickets.file` cover this
> **Flag(s):** `ui.brand_theming` (new, seeded off)
> **Estimated complexity:** large
> **Pipeline mode:** Accelerated — Phases 1–3 collapsed into this entry (rationale: the
> feature set, contracts, and data model were designed and approved in the kit's master
> plan and are ports of production-proven ancestors; this entry records the design
> deltas rather than re-deriving them)

---

## Per-Phase Status

| Phase | Owner | Status | Verdict | Date |
|-------|-------|--------|---------|------|
| 1 — Functional refinement | analyst | Done (collapsed) | READY WITH NOTES | 2026-09-11 |
| 2 — Architectural review | architect | Done (collapsed) | Approved | 2026-09-11 |
| 3 — Technical design | tech-lead | Done (collapsed) | — | 2026-09-11 |
| 4 — Implementation | full-stack-developer | Done | — | 2026-09-11 |
| 5 — Verification | qa | Done | PASS | 2026-09-11 |
| 6 — Shipped vs intent | analyst | Done | SHIP WITH NOTES | 2026-09-11 |

---

# Phases 1–3 (collapsed) — Design Record

## Summary

Three tracks. **A — Helpdesk:** single-tenant adaptation of the ancestor ticket system:
`tickets` / `ticket_messages` / `ticket_actions` tables (module `helpdesk`), typed
discriminated-result business logic, portal Support section (file, thread, reply), admin
triage queue (status/assign/classify/area/priority controls), feedback → ticket
promotion, five email triggers through the existing queue. **B — Brand engine:** new
`@repo/brand` package — zero-import token contract (closed brandable/bounded/platform
partition), pure OKLCH generator with property tests, WCAG contrast math, the
`:root:root` single-style-element `BrandTokens` emitter; `branding` single-row table +
history (module `core`); admin `/branding` editor; `ui.brand_theming` flag (default
off); `pnpm brand:generate` CLI; `check-brand-scope` tripwire. **C — Maintenance:**
repair the ported maintenance cron (ancestor table references), `/api/health` on both
apps, correct portal `vercel.json`.

## Design deltas vs the ancestor sources

- Single tenant: no organization column anywhere; submitter is a `users` row; operator
  is any user holding `admin.tickets`. Composite tenant FKs are dropped.
- No attachments in v1 (the kit has no blob storage yet) — schema comment marks the
  extension point.
- Ticket `area` vocabulary generalized: account/billing/content/website/other.
- Feedback gains nullable `promoted_to_ticket_id` (same migration as helpdesk tables).
- Brand storage: one `branding` row (id CHECK = 'default'), not per-tenant rows.
- Emails: notification templates render at enqueue time via each app's existing
  email lib; all sends go through `email_queue` (Invariant 12).

## Permissions & Flags

- Permissions (already in catalog + seed): `admin.tickets`, `admin.branding`,
  `tickets.file` (member default).
- Flag: `ui.brand_theming`, platform-wide (app NULL), seeded off. A flag gates the
  *emission* of runtime brand overrides, never any permission (Invariant 4).

## Data Model

Migration `0006_helpdesk.sql` (`-- MODULE: helpdesk`): `tickets`, `ticket_messages`,
`ticket_actions`, plus `ALTER TABLE feedback ADD COLUMN promoted_to_ticket_id`.
Migration `0007_branding.sql` (`-- MODULE: core`): `branding` (single-row), 
`branding_history` (append-only).

## API Contract (server actions, all returning ActionResult<T>)

Portal: `fileTicketAction`, `replyToTicketAction`. Admin: `replyAsOperatorAction`,
`setTicketStatusAction`, `assignTicketAction`, `reclassifyTicketAction`,
`setTicketAreaAction`, `setTicketPriorityAction`, `promoteFeedbackToTicketAction`,
`saveBrandingAction`. Cron/API routes: `/api/cron/email-queue` (existing),
`/api/cron/maintenance` (repaired), `/api/health` (both apps, new).

## Implementation Order

1. Schema + migrations (helpdesk, branding) → db helpers + tests
2. `@repo/brand` (contract → contrast → generate → emitter) + property tests
3. Portal Support UI + actions; admin tickets UI + controls; admin branding editor
4. BrandTokens mounts; flag seed; brand-generate CLI; brand-scope tripwire
5. Maintenance repairs (cron route, vercel.json, health)
6. Audit events on every state change; release-notes entry

## Claims Ledger (design)

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| 1 | `admin.tickets`, `admin.branding`, `tickets.file` already exist in the catalog and seed | Verified | packages/permissions/src/index.ts L42-49, L110-140; packages/db/src/seed.ts reads FEATURE_CATALOG + MEMBER_DEFAULT_FEATURES |
| 2 | The email queue + enqueue helper exist and portal owns the processor | Verified | packages/db/src/schema/platform.ts L158-235; apps/portal/src/lib/email/queue.ts; apps/portal/src/app/api/cron/email-queue/route.ts |
| 3 | The ported maintenance cron references ancestor tables that do not exist in this kit (`portal.projects`, `portal.password_reset_tokens`) | Verified | apps/portal/src/app/api/cron/maintenance/route.ts L17-27, L62-67; packages/db/src/schema/platform.ts has these tables in `public`, no `projects` anywhere |
| 4 | portal vercel.json declares a `task-reminders` cron with no route behind it | Verified | apps/portal/vercel.json; `apps/portal/src/app/api/cron/` contains only email-queue + maintenance |
| 5 | Feedback status machine + triage list live in @repo/db and are reused for promotion | Verified | packages/db/src/feedback.ts L48-157 |

## What was NOT verified

- The ancestor tickets/brand sources' exact current line numbers (re-read during
  implementation, not pinned here).
- Behavior against a live Postgres — deferred to Phase 7 (kit-wide), as with Phases 1–2.

---

# Phase 4 — Implementation

## Prior-Phase Spot-Check

Design claims 1–5 re-derived by direct file reads immediately before implementation
(same session); no diffs.

## Files Created

- packages/db/src/schema/{support,branding}.ts + migrations/{0006_helpdesk,0007_branding}.sql
- packages/db/src/tickets.ts (+ tickets.test.ts, 16 tests) — vocabularies, transitions, validation, reads, operator resolution, promotion validation
- packages/brand/** — contract.ts (ramp-based token policy, LEGAL_PAIRS, TYPE_PAIRINGS, STARTER_RAMP), contrast.ts, generate.ts (inline OKLab, directional lightness search), brand-tokens.tsx (:root:root emitter), generate.test.ts (11 tests incl. 384-seed property sweep), scripts/generate-cli.ts
- Portal: (member)/support/{page,file-ticket-form,actions,[id]/page,[id]/reply-form}, lib/tickets-labels.ts (+ mirror test), lib/tickets-notifications.ts, components/brand/runtime-brand.tsx, api/health/route.ts
- Admin: (app)/tickets/{page,actions,actions.test (12 tests),[id]/page,[id]/ticket-controls,[id]/operator-reply-form}, (app)/branding/{page,branding-form,actions}, (app)/feedback/promote-to-ticket-button.tsx, lib/tickets-labels.ts (+ test), lib/tickets-notifications.ts, components/brand/runtime-brand.tsx, api/health/route.ts
- scripts/check-brand-scope.mjs (comment-aware; wired into run-tripwires)

## Files Modified

- packages/db: schema/index.ts, index.ts (new exports); schema/platform.ts (+feedback.promotedToTicketId); feedback.ts (listFeedback selects the promotion pointer)
- packages/ui: none
- Portal: proxy.ts (+/support PROTECTION_RULES entry), lib/tiles.ts (+Support tile; account renumbered 30→40 for the spacing rule), lib/audit.ts (+TICKET_FILED), audit.test.ts, app/layout.tsx (RuntimeBrand mount), vercel.json (removed the route-less task-reminders cron), api/cron/maintenance/route.ts + test (REWRITTEN — see notes)
- Admin: app-sidebar-nav.tsx + (app)/layout.tsx (Tickets + Branding entries), lib/audit.ts (+7 keys) + audit.test.ts, (app)/feedback/page.tsx (promote control), app/layout.tsx (RuntimeBrand mount)
- Root: package.json (+brand:generate), scripts/run-tripwires.mjs (+check-brand-scope)

## Schema Changes

- `0006_helpdesk.sql` — tickets, ticket_messages, ticket_actions, feedback.promoted_to_ticket_id
- `0007_branding.sql` — branding, branding_history

## Audit Events

- ticket lifecycle: `TICKET_FILED`, `TICKET_STATUS_CHANGED`, `TICKET_ASSIGNED`,
  `TICKET_RECLASSIFIED`, `TICKET_AREA_CHANGED`, `TICKET_PRIORITY_CHANGED`,
  `TICKET_OPERATOR_REPLIED`, `FEEDBACK_PROMOTED_TO_TICKET`
- branding: `BRANDING_UPDATED`

## Implementer Notes

- KIT-SHAPED BRAND CONTRACT (deviation from the ancestor, deliberate): theme.css derives every interactive token from the --brand-* ramp via var() indirection, so the emitter re-declares ONLY ramp steps — the ancestor's per-role emission is unnecessary here and the closed-partition property is preserved (brandable = RAMP_STEPS, platform = everything else, tripwire-enforced).
- Ticket transitions allow REOPEN (resolved/declined → in_progress), unlike feedback's forward-only machine — an operator decision after a fix doesn't hold.
- The ported maintenance cron carried ancestor-schema table refs ("portal"."password_reset_tokens", a portal.projects purge) that no kit table answers to, plus vercel.json declared a task-reminders cron with no route — rewritten around GC_TABLES with a compiled-SQL regression test pinning "public"-schema names.
- Fonts: branding stores the type pairing; per-app next/font wiring to actually switch faces is a named follow-up (docs/TODO.md), not silently claimed.
- No attachments in v1 (no blob storage in the kit); extension point documented in the schema.

## Claims Ledger

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| 1 | Full pipeline green: 19/19 turbo tasks (typecheck, lint, test, build; both apps + 5 packages) | Verified | `pnpm turbo run typecheck lint test build` 2026-09-11 — "Tasks: 19 successful, 19 total" |
| 2 | Test totals: brand 11 (incl. 384-seed property sweep, every LEGAL_PAIRS floor, both schemes), db 21, auth 92, permissions 10, ui 57, admin 165, portal 384 | Verified | same run's per-package vitest summaries |
| 3 | Tripwires green incl. new check-brand-scope; kit:verify stamped | Verified | `pnpm kit:verify` — 5/5 PASS, "marker stamped for HEAD 9166b87064" |
| 4 | Every operator state change writes ticket_actions + recordAudit; replies are audit-exempt with reasons | Verified | apps/admin/src/app/(app)/tickets/actions.ts (each mutation body); actions.test.ts asserts audit calls |
| 5 | Ancestor-name sweep across all new/ported files: 0 hits | Verified | grep -rniE over the Phase-3 file set, 2026-09-11 |
| 6 | Bodies stay out of email and out of session tooling (subjects only in email; kit-status unchanged) | Verified | tickets-notifications.ts both apps (no body interpolation); scripts/kit/kit-status.mjs untouched |

## What was NOT verified

- No live-Postgres run of 0006/0007 or the rewritten maintenance GC (compiled-SQL tests only) — Phase 7's real-database pass owns this.
- No browser click-through of the new pages (forms, controls, preview) — `next build` static analysis only; Phase 7 e2e owns it.
- Email rendering in a real inbox (queue rows are constructed and unit-shaped only).
- The :root:root emitter's cascade behavior against Radix portals in a real browser (rationale is ported and property-tested at the CSS-string level only).

---

# Phase 5 — Verification (qa)

## Prior-Phase Spot-Check

Phase 4 ledger claims 1–3 re-derived by re-running the commands fresh (same
session, cold turbo cache for the final run); no diffs.

**Date:** 2026-09-11 · **Verified by:** qa (same-session accelerated mode — an
independent re-verification pass is part of the kit-wide Phase 7 gate)

## Type Check / Lint / Build

`pnpm turbo run typecheck lint build`: PASS (all workspaces).

## Unit Tests

Total: 740 across 7 workspaces | Failed: 0. New this phase: brand 11, db +16,
admin +14 (12 actions + 2 labels), portal +5 (2 labels mirror + 3 maintenance).

## End-to-End Tests

None run — no e2e harness exists yet (Phase 7 gate; consistent with Phases 1–2).

## Regression Tests Added

- maintenance route compiled-SQL test — guards against ancestor-schema table
  references (the exact defect found in the ported route); asserts
  "public"-schema names, expires_at predicate, LIMIT 500, and the exact
  4-table GC list. Failing-first: ran against the OLD route before the
  rewrite in-session (portal.projects assertion failed as expected).
- tickets-labels mirror tests (both apps) — a vocabulary edit that misses one
  side fails the build.

## Feature-Gate Audit

| Route or action | auth()? | hasFeature? | Key |
|---|---|---|---|
| portal /support, /support/[id] (pages) | yes (layout+page) | yes | tickets.file (+ proxy rule) |
| fileTicketAction / replyToTicketAction | yes | yes (+ ownership WHERE on reply) | tickets.file |
| admin /tickets, /tickets/[id] (pages) | yes | yes | admin.tickets |
| all operator ticket actions | yes | yes | admin.tickets |
| promoteFeedbackToTicketAction | yes | yes | admin.tickets (deliberate: creates a ticket) |
| admin /branding page + save/clear actions | yes | yes | admin.branding |
| /api/health (both) | none — deliberate | n/a | unauthenticated liveness probe, no secrets in output |
| /api/cron/* | CRON_SECRET bearer (503 unconfigured) | n/a | n/a |

## Pre-merge UX Audit

Run against UI-STANDARDS.md for the new surfaces: four-state handling (loading
via pending flags, empty states, error toasts, populated), no native dialogs,
labels on every control, keyset "from" back-nav on portal thread, color never
the sole signal (pills carry text), 44px touch targets via shared primitives.
No checklist item unchecked; visual QA in a real browser deferred to Phase 7
(recorded above, not silently skipped).

## Verdict

PASS (auth-touching files: none — proxy gained a rule entry but the auth flow
itself is untouched, so the running-server e2e requirement does not trigger).

## Claims Ledger

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| 1 | 740 tests, 0 failures, across the workspace | Verified | turbo test output 2026-09-11 |
| 2 | The regression test failed before the maintenance rewrite and passes after | Verified | in-session failing-then-passing runs |

## What was NOT verified

Same four items as Phase 4's list (live DB, browser, inbox, portal-cascade) —
all owned by Phase 7.

---

# Phase 6 — Shipped vs Intent (analyst)

## VERDICT

SHIP WITH NOTES

## ONE-LINE TAKE

> The kit now has a working helpdesk loop (feedback → ticket → resolution, with
> queued email at every hop), an accessibility-guaranteed one-seed theming
> engine behind a flag, and honest health/maintenance plumbing — with fonts,
> attachments, and live-DB verification named as follow-ups rather than implied.

## Intent-vs-Shipped Diff

- Plan said "helpdesk single-tenant adaptation" — shipped, incl. the promote
  on-ramp and 5 email triggers. Matches.
- Plan said "brand engine port" — shipped as a ramp-based contract (kit-shaped
  rather than role-based; recorded as deliberate adaptation). Acceptable drift.
- Plan said "email processor + webhook" — already existed from Phase 2's port;
  this phase REPAIRED the maintenance half instead. Acceptable drift.
- Type pairing font wiring: stored but not rendered. SHIP-note → TODO.

## Follow-Ups (in docs/TODO.md this session)

- Attachments (needs blob storage) · font wiring for type pairings ·
  open-ticket count in kit:status · Phase 7 owns live-DB + browser + e2e passes.

## What was NOT verified

Phase 5's list, unchanged.
