# Incoming contributions — 2026-09-11

From `chenson42/npvitals` (the Kindway monorepo), via `/downstream-sync` after
re-parenting to Stackkeel on 2026-09-11. Sibling PR #6 (merged) came from the
same run.

Five specs, all `backport-ready`. Each was checked against Stackkeel's actual
code before being written — several are things this repo's own instructions or
source comments already describe in the present tense, so the spec's job is
narrower than "add a feature": it is making a claim that already exists true.

| # | What | Already referenced here as existing |
|---|---|---|
| 01 | `check-schema-prerequisites.mjs` | `AGENTS.md` Invariant 3, five agent/skill files, `packages/db/README.md` |
| 02 | `check-driver-capability.mjs` | `apps/admin/src/app/(app)/users/[id]/actions.ts:134-142` |
| 03 | `check-cross-app-table-collision.mjs` | `docs/TODO.md:76`, `apps/portal/src/lib/db/schema.ts:1-13` |
| 04 | `feedback-check.mjs` | `.claude/skills/process-feedback/SKILL.md:158`, Invariant 13 |
| 05 | `stamp && git push` chaining trap | — (net-new documentation) |

**Two candidates from the same run are deliberately absent.** The
`check-instructions` `scripts/`-scope fix shipped as PR #6. `check-audit-coverage`
was implemented here independently in `59b6a7e` while this was being written —
verified present, wired into `run-tripwires.mjs`, and passing, rather than taken
on report.

**On 01 and 04 specifically:** PR #6 marked three references as "not yet
implemented" rather than deleting them, on the grounds that the designs were
settled and the scripts were unbuilt rather than unwanted. Implementing 01 and
04 is what lets those markers come back out.
