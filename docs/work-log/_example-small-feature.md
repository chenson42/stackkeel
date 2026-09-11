# EXAMPLE — Add a "resend verification email" button (small feature)

> This file is a worked example of a *good, short* work-log, kept deliberately at
> ~100 lines. Agents calibrate from examples more than from stated limits: a small
> feature's work-log should look like this, not like the kit's multi-thousand-line
> bootstrap logs (those documented whole phases of kit construction — they are the
> ceiling, not the norm). The `_` prefix exempts this file from the work-log gate.

- **Classification:** Feature (touches API + UI, user-visible)
- **App(s):** portal
- **Source:** feedback row #42 (status: triaged)

## Per-Phase Status

| Phase | Owner | Status |
|---|---|---|
| 1 Functional refinement | analyst | Done |
| 2 Architectural review | architect | Skipped — no new deps, no schema, no invariant surface (noted per pipeline rules) |
| 3 Technical design | tech-lead | Done (folded into Phase 1 notes — small feature) |
| 4 Implementation | full-stack-developer | Done |
| 5 Test verification | qa | PASS |
| 6 Shipped vs intent | analyst | SHIP IT |

# Phase 1 — Functional refinement (analyst)

User verb: "I never got my verification email; let me ask for another."
Flow: signed-in unverified user sees a banner on `/account` → clicks Resend →
rate-limited server action re-enqueues the verification email → toast confirms.
Auth gate: session required; only for `emailVerified IS NULL` users.
Adversarial pass: repeated clicks must not flood the queue (reuse the existing
rate limiter, key `resend-verify:<userId>`, 3/hour); the action must not reveal
whether an email is deliverable. Gaps: none. **READY FOR DESIGN** (design folded
in: one server action + one client button; implementer: full-stack-developer).

# Phase 4 — Implementation

- `src/app/(account)/account/resend-verification-action.ts` — server action:
  session check, unverified check, rate limit, `enqueueEmail()` reusing the
  existing verification template, `ActionResult<T>` return.
- `src/app/(account)/account/resend-verification-button.tsx` — client button,
  pending state, toast on ok / rate-limited.
- Audit: intentionally none — attribute-shaped self-serve action, precedent:
  profile update. `// audit-exempt: self-serve re-send, no state change`.

## Claims Ledger

| # | Claim | Class | Evidence |
|---|---|---|---|
| 1 | Action re-checks session + unverified inside the body | Verified | resend-verification-action.ts:12-19 read |
| 2 | Rate limit uses the shared limiter, 3/hour | Verified | resend-verification-action.ts:21-24; limiter contract in lib/rate-limit.ts:30-41 |
| 3 | Email goes through the queue, not direct send | Verified | action calls `enqueueEmail` (line 28); no `resend.` import in the diff |

## What was NOT verified

- Actual email delivery (no provider key in dev; queue row inspected instead).
- Behavior when the user verifies in another tab mid-request (accepted: second
  enqueue is harmless and the email links are idempotent).

# Phase 5 — Verification (qa)

Re-derived claims 1-3 from the diff before reading the ledger — no drift. Unit
test added for the rate-limited branch (revert-proofed: fails without the limiter
call, output pasted in PR). `pnpm --filter portal typecheck lint test` green.
UX audit: four-state button ✓, toast copy ✓, no native dialogs ✓. **PASS**

## What was NOT verified

- Cross-browser rendering of the banner (visual pass in Chromium only).

# Phase 6 — Shipped vs Intent (analyst)

Matches the Phase 1 flow exactly; feedback row #42 moved to done; what's-new entry
skipped (minor surface). **SHIP IT**
