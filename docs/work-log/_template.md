# [Feature Title] — Work Log

> **Slug:** `YYYY-MM-DD-<short-description>`
> **Surface:** [portal | admin | shell | mobile | packages | mixed]
> **Permission(s):** [new key(s), or "existing X covers this"]
> **Flag(s):** [new key, or "not needed"]
> **Estimated complexity:** [small | medium | large]
> **Pipeline mode:** [Full | Accelerated — Phase 2 skipped (rationale) | Bug-fix variant]
> **Source — user feedback:** `feedback-row-id: <UUID>`
> *(omit this block entirely if the work did not originate from in-app feedback; never
> quote the feedback body — see AGENTS.md → Cross-AI Conventions)*

---

## Per-Phase Status

| Phase | Owner | Status | Verdict | Date |
|-------|-------|--------|---------|------|
| 1 — Functional refinement | analyst | Pending | — | — |
| 2 — Architectural review | architect | Pending | — | — |
| 3 — Technical design | tech-lead | Pending | — | — |
| 4 — Implementation | TBD by tech-lead | Pending | — | — |
| 5 — Verification | qa | Pending | — | — |
| 6 — Shipped vs intent | analyst | Pending | — | — |

---

# Phase 1 — Functional Refinement (analyst)

## VERDICT

[READY FOR DESIGN | READY WITH NOTES | NEEDS REWORK | NOT YET]

## ONE-LINE TAKE

> [The feature in one honest sentence.]

## User Verbs

| Surface | Verb | Cadence |
|---------|------|---------|
| [portal / admin / mobile / anonymous] | [verb] | [on demand / per session / one-time] |

## Flows

**Flow 1 — [name]:** [entry → step → step → outcome]
- Failure: [what the user sees if a step goes wrong]

**Flow 2 — [name]:** [...]

## Permissions & Flags

- **Permission(s):** [new `FEATURES.KEY`, or existing key reused]
- **Default roles:** [list]
- **Flag(s):** [new key + rollout plan, or "not needed"]

## Gaps the Request Didn't Address

- [Gap, why it matters, suggested resolution]

## Out of Scope (confirm with user)

- [Thing the request implies but isn't in scope]

## Open Questions

- [Question for the user]

## Claims Ledger

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| | | Verified / Indicative | |

## What was NOT verified

[Claims this phase depended on but did not independently re-derive or check.]

---

# Phase 2 — Architectural Review (architect)

## Prior-Phase Spot-Check

[Which prior-phase ledger claims were re-derived — commands re-run, code re-read —
*before* reading the claimed answers, and any diffs found. A load-bearing diff loops back
to the earliest affected phase; a non-load-bearing diff is logged here and this phase
continues.]

## Verdict

[Approved | Approved with suggestions | Needs revision]

## Placement

- Directory placement: [apps/<app>/src/... or packages/<pkg>/...]
- Server vs Client split: [where 'use client' is needed and why]
- Dependencies: [new dep needed (yes/no), evaluation]

## Invariants Touched

- [Invariant (AGENTS.md → Key Invariants), and how this change respects it — or how it
  changes it, which requires an AGENTS.md update in the same commit]

## Surface Ladder

- [For any new overlay surface: the UX-PATTERNS.md § 4 ladder step it lands on]

## Notes

[Anything Phase 3 must honor.]

## Claims Ledger

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| | | Verified / Indicative | |

## What was NOT verified

[...]

---

# Phase 3 — Technical Design (tech-lead)

## Prior-Phase Spot-Check

[As above.]

## Summary

[One paragraph: what we're building and why.]

## Permissions & Flags

- Permission key(s): `area.action`
- Default role bindings: [list]
- Feature flag(s): [key, or "not needed"]

## API Contract

- `POST /api/...` — purpose, request body, response shape
- Or server-action signatures: `async function actionName(input): Promise<ActionResult<T>>`

## Data Model

[New tables / columns / indexes — including the `-- MODULE:` header the migration will
carry if this belongs to an optional module — or "No schema changes required."]

## Component / Page Plan

- Pages to create: [list]
- Components to create: [list; check `packages/ui` first — UX-PATTERNS.md § 1]
- Files to modify: [list]

## Implementation Order

1. Schema (if any) → migration generated and reviewed
2. `FEATURE_CATALOG` entry + seed binding
3. Route handlers / server actions
4. UI
5. Audit events for security-sensitive paths
6. Release notes entry

## Edge Cases & Risks

- [Thing that could fail or needs special handling]

## Implementer

[database-admin | api-developer | ux-developer | full-stack-developer | mobile-developer]

## Claims Ledger

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| | | Verified / Indicative | |

## What was NOT verified

[...]

---

# Phase 4 — Implementation

## Prior-Phase Spot-Check

[As above.]

## Files Created

- `path/to/file` — purpose

## Files Modified

- `path/to/file` — what changed

## Schema Changes

- [Tables / columns added, or "none"]
- Applied via: [migration file, or db:push on a dev branch]

## Audit Events

- [Action key written when the security-sensitive mutation fires]

## Implementer Notes

[Tradeoffs taken, anything that diverged from the design and why.]

## Claims Ledger

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| | | Verified / Indicative | |

## What was NOT verified

[Required for a Done Phase 4 — enforced by the work-log discipline check.]

---

# Phase 5 — Verification (qa)

## Prior-Phase Spot-Check

[As above — re-derive Phase 4's ledger claims independently before reading them.]

**Date:** YYYY-MM-DD
**Verified by:** qa

## Type Check

`pnpm typecheck`: PASS / FAIL

## Unit Tests

Total: N | Passed: N | Failed: N | Duration: Xs
Failures: [test name — error — file:line]

## End-to-End Tests

Total: N | Passed: N | Failed: N | Duration: Xs
Failures: [...]

## Regression Tests Added

- [test name — file:line — guards against: brief description — pasted failing-then-passing output]

## Feature-Gate Audit

*(Mandatory. Verified by reading route/action bodies, not by inferring from green tests.
Write "no protected routes touched" if none.)*

| Route or action | `auth()` present? | `hasFeature(...)` present? | Correct `FEATURES.*` key? |
|-----------------|-------------------|----------------------------|----------------------------|
| [method + path, or action name] | yes / no | yes / no | `FEATURES.X` or n/a |

## Pre-merge UX Audit

[Required for any UI-touching change — run the UI-STANDARDS.md checklist; a single
unchecked box blocks PASS. Write "no UI touched" if none.]

## Verdict

[PASS | FAIL | BLOCKED — name the unmet prerequisite]

*(Auth-touching diffs: PASS requires e2e against a real dev server with a 2FA-enrolled
seeded user; deferred e2e = BLOCKED.)*

## Claims Ledger

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| | | Verified / Indicative | |

## What was NOT verified

[Required for a Done Phase 5 — enforced by the work-log discipline check.]

---

# Phase 6 — Shipped vs Intent (analyst)

## Prior-Phase Spot-Check

[As above.]

## VERDICT

[SHIP IT | SHIP WITH NOTES | NEEDS REWORK]

## ONE-LINE TAKE

> [The shipped feature in one honest sentence.]

## What's Working

- [Specific. The flow that works well and why.]

## Intent-vs-Shipped Diff

- Phase 1 said: [X]. Shipped: [Y]. Verdict: [matches | acceptable drift | regression]

## Edge Cases

- Empty state: [pass | fail | not applicable]
- Failure microcopy: [pass | fail]
- Permission gate: [pass | fail]
- Audit event: [pass | fail | not applicable]
- Mobile (375px): [pass | fail]

## Follow-Ups (if SHIP WITH NOTES)

- [Concrete, actionable. Each lands in docs/TODO.md in this same session.]

## Red Flags (if NEEDS REWORK)

- [Specific. What has to change before this ships.]

## Claims Ledger

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| | | Verified / Indicative | |

## What was NOT verified

[...]
