# Phase 5 — Personalization + Sync Meta-Layer

**Classification:** Feature (full pipeline; Phases 1–3 compressed into the approved
plan + meta-layer design doc, noted per AGENTS.md — the design was produced and
user-approved during planning; this entry executes it.)

**Source:** approved plan §Meta-layer; meta-layer design doc §1–§5.

## Per-Phase Status

| Phase | Owner | Status |
|---|---|---|
| 1 Functional refinement | analyst | Done (design doc §2–§4, approved) |
| 2 Architectural review | architect | Done (design doc; layout final as of 5531f6b) |
| 3 Technical design | tech-lead | Done (design doc §1–§5) |
| 4 Implementation | full-stack-developer | Done |
| 5 Verification | qa | Done |
| 6 Shipped vs intent | analyst | Done — SHIP WITH NOTES |

# Phase 4 — Implementation

## Scope

- `scripts/kit/module-registry.json` — authoritative strip registry (audited against
  the real tree, not the plan).
- `scripts/kit/strip-module.mjs` (+ unit tests) — plan/execute a registry entry;
  `--dry-run` prints the action list.
- `scripts/kit/identity-files.json` + `scripts/kit/check-identity-files.mjs` (+ wiring
  into `run-tripwires.mjs`) — identity-bearing file registry + anti-rot tripwire.
- `.claude/skills/{personalize,upstream-sync,downstream-sync}/SKILL.md`.
- `.github/workflows/{kit-sync-reminder,e2e,db-sync}.yml`.
- Seam fences (`kit-module:<name>-begin/-end` comment pairs) in shared files so
  strip-module can remove module hooks mechanically.

## Module model (as audited)

Migrations by module: `core` 0000/0005/0007 · `two-factor` 0001 · `email-queue` 0002 ·
`feedback` 0003 · `whats-new` 0004 · `helpdesk` 0006 · `mobile` 0008.

Registry modules: apps `admin`, `shell`, `mobile`, `docs-site`; features `helpdesk`,
`feedback`, `twoFactor`, `oidc`, `emailQueue`, `whatsNew`, `flagsAdmin`,
`auditViewer`; plus **`device-auth`**, an auto module (portal device APIs + bridge +
db devices schema + admin device pages) stripped automatically only when BOTH `shell`
and `mobile` are stripped — the shell needs device auth even without the Expo app.

## Strip strategies (deliberate v1 gradations)

- **Full file-strip, seam-fenced, rehearsed:** `mobile`, `helpdesk`, `admin` (the
  rehearsal set), plus `shell`, `docs-site`, `feedback`, `whatsNew` (fenced, dry-run
  verified).
- **Page-strip only:** `flagsAdmin`, `auditViewer` — admin pages + sidebar entries;
  infrastructure (flags table, audit writes) is core and stays.
- **`schemaStrategy: "leave-in-place"`:** feature schema living inside `0000_core`
  (invites, flags, audit) is never dropped — dropping columns is not worth the risk.
- **`strategy: "keep-dormant"`:** `twoFactor` and `oidc` are woven through
  `packages/auth`, both proxies, and the admin atomic sign-in. v1 strip removes docs
  anchors and env lines and explains that the code stays compiled but dormant (2FA
  enforcement is per-user and defaults off; OIDC activates only when env vars are
  set). Recorded as a deviation from the design's implied file-strip; a full
  file-strip of these is a filed TODO.

## Seam fences added (each recorded here per the sanctioned exception)

- `packages/db/src/index.ts` + `src/schema/index.ts` — export lines for `helpdesk`
  (tickets/support), `device-auth` (devices), `feedback`.
- `packages/db/src/schema/platform.ts` — `promotedToTicketId` column (helpdesk).
- `packages/db/src/feedback.ts` — promotion projection line (helpdesk).
- `apps/portal/src/proxy.ts` — `/support` rule (helpdesk); `.well-known` bypass
  (device-auth).
- `apps/portal/src/app/(member)/layout.tsx` — mobile bridge imports + mounts
  (device-auth).
- `apps/portal/src/lib/tiles.ts` — support (helpdesk), feedback, whats-new tiles.
- `apps/portal/src/lib/app-switcher.ts` (+ test) — admin tile + `ADMIN_URL` (admin).
- `apps/portal/src/lib/audit.ts` (+ mirror test) — `TICKET_FILED` (helpdesk),
  `DEVICE_*` (device-auth), `FEEDBACK_*` (feedback).
- `apps/admin/src/lib/audit.ts` (+ mirror test) — `TICKET_*` (helpdesk),
  `DEVICE_*`/`APP_RELEASE_*` (device-auth), `FEEDBACK_*` (feedback), `WHATS_NEW_*`
  (whats-new), `FLAG_*` (flagsAdmin).
- `apps/admin/src/app/(app)/app-sidebar-nav.tsx` — per-module `can*` const + nav
  entry pairs (helpdesk, feedback, device-auth, whatsNew, emailQueue, flagsAdmin,
  auditViewer).
- `apps/portal/.env.example` — mobile block (device-auth), `NEXT_PUBLIC_ADMIN_URL`
  (admin). `#`-comment fence form.
- `apps/admin/src/app/(app)/feedback/*` promote control is inside helpdesk's paths
  list (file delete), not a fence.

## Seam-bug fixes (sanctioned minimal edits)

- `apps/portal/src/lib/tiles.test.ts` — the exact-id-list assertion hardcoded every
  tile id, breaking under any tile strip; rewritten registry-derived (module-agnostic,
  same coverage).

# Phase 5 — Verification (qa)

| Check | Result |
|---|---|
| `node --test 'scripts/**/*.test.mjs'` (incl. new strip-module + identity tests) | PASS |
| `pnpm check` tripwires (incl. new check-identity-files) | PASS |
| `pnpm kit:verify` (real repo, full turbo + tripwires) | PASS |
| Strip rehearsal in scratch clone: `mobile` → `helpdesk` → `admin`, then `pnpm install && turbo typecheck build` | PASS (see report) |
| `--dry-run` for every registry module | PASS (plans generate, no writes) |
| Ancestor-name sweep over everything new | 0 hits |

## What was NOT verified

- A real fork personalization end-to-end (interview + branding + strip + identity
  find-replace as one flow) — the skill's steps are individually rehearsed
  (strip: scratch clone; identity: check-identity-files; branding: brand:generate),
  not composed. Phase 7 owns the composed dry-run.
- upstream-sync / downstream-sync against a live fork pair — the skills carry the
  ancestors' battle-tested logic plus this kit's deltas, but no fork of stackkeel
  exists yet. Known Untested Paths sections in both skills say exactly this.
- `kit-sync-reminder.yml`, `e2e.yml`, `db-sync.yml` have never executed (reminder
  is fork-only by guard; e2e skips without NEON_API_KEY + e2e/ dirs; db-sync skips
  without a DATABASE_URL secret).
- Strips of `feedback`, `whatsNew`, `shell`, `docs-site`, `flagsAdmin`,
  `auditViewer` are dry-run + fence-verified but not clone-rehearsed.
- Post-strip `lint` cleanliness in forks (rehearsal gate is typecheck + build).

# Phase 6 — Shipped vs Intent (analyst)

Matches the meta-layer design with three recorded deviations: `device-auth` auto
module (design had device auth inside `mobile`; the shell dependency makes that
wrong); `twoFactor`/`oidc` keep-dormant strategy (design implied file-strip); e2e
workflow ships gated-and-skipping because Playwright suites are Phase 7. SHIP WITH
NOTES — notes filed in docs/TODO.md.
