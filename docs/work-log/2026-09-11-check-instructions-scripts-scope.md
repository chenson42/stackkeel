# check-instructions Could Not See scripts/ — Work Log

- **Classification:** Bug fix (tooling)
- **App(s):** scripts/ (tripwire layer)
- **Source:** PR #6, contributed from the npvitals fork after a `/downstream-sync`
  run — the first external contribution taken through the kit's own gates.

## Per-Phase Status

| Phase | Owner | Status |
|---|---|---|
| 1 Brief | analyst | Done — bug confirmed real (see ledger) |
| 2 Architectural review | architect | Skipped — no invariants touched (noted) |
| 3 Root cause | tech-lead | In the PR body: `PATH_REF` alternation omitted `scripts/`, the one root directory holding the enforcement the checker exists to keep honest |
| 4 Implementation | contributor (fork session) | Done — PR #6 |
| 5 Verification | qa (this session) | PASS |
| 6 Shipped vs intent | analyst | SHIP IT |

# Phase 5 — Verification

Derive-then-diff on the PR's load-bearing claims, performed before merge:

| # | Claim | Class | Evidence |
|---|---|---|---|
| 1 | The four named tripwires do not exist | Verified | `ls scripts/` grep for schema-prereq/feedback-check/driver-capab/audit-coverage → no matches, 2026-09-11 |
| 2 | `PATH_REF` omitted `scripts/` on main | Verified | scripts/check-instructions.mjs:291 read on main before checkout |
| 3 | PR tests pass and are revert-proofed | Verified | 78/78 via `node --test 'scripts/*.test.mjs'` on the PR branch; PR body documents 3/6 failing against the unpatched checker |
| 4 | All six tripwires pass with the PR's honest markers | Verified | `node scripts/run-tripwires.mjs` on the PR branch, all PASS |

## What was NOT verified

- The PR's claim that its fixture-based tests restore the checker byte-identical
  (trusted from the PR body; the suite passing is the practical check).
- Two bare-identifier false claims the improved checker still cannot catch,
  found during this review: `AGENTS.md` Invariant 6 says the `check:audit`
  tripwire "fails CI", and the docs-site audit page describes
  `check-audit-coverage` as existing. Neither is a backticked path. Resolution:
  implement `check-audit-coverage` in the follow-up rather than soften two more
  claims — tracked in docs/TODO.md alongside the contributor's offer of backport
  specs for the remaining unbuilt tripwires.

# Phase 6 — Shipped vs Intent

The fix does what the PR says, the markers tell readers the truth, and the gate
that caught the missing trailer (commit-grammar CI) is the same enforcement layer
this kit sells. SHIP IT.
