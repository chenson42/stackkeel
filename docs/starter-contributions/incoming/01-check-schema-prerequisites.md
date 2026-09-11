# 01 — `check-schema-prerequisites.mjs`: has the deploy target actually got this migration?

**Origin:** `chenson42/npvitals` root `scripts/check-schema-prerequisites.mjs` (443 lines), work-log `apps/portal/docs/work-log/2026-09-11-stackkeel-parent-and-downstream-sync.md`. Built after a real ~24-minute staging outage: commit `683c7b7` made `packages/auth/src/jwt.ts` unconditionally `SELECT users.roles_version` on every authenticated request, while the migration creating that column had only been applied locally. Vercel auto-deployed and every authenticated request on all three apps broke.

**What & why:** every other gate passed, and none of them could have caught it. Typecheck, lint and build read the schema *file*, not the live database. The drift check compares schema files to the *committed migration set* — and both agreed, because the migration existed and was correct. Nothing modelled *"has this migration actually been applied to the environment this branch deploys to?"* Any kit using file-based SQL migrations with a separate apply step has the identical exposure: a migration can be committed without being applied, and no step in a normal pipeline talks to the deploy target at all. This is unusually cheap for Stackkeel because **the `-- VERIFY:` convention it depends on already ships here** — `packages/db/migrations/0001_two-factor.sql:2`, `0006_helpdesk.sql:5` and `0008_devices.sql:7` each carry one. The gate is described in the present tense by `AGENTS.md` Invariant 3, five agent/skill files, and `packages/db/README.md`; PR #6 marked the two that named a path. This spec is the other half.

**Applies to the kit as:** `scripts/check-schema-prerequisites.mjs`, added to `TRIPWIRES` in `scripts/run-tripwires.mjs`, and invoked from `.claude/skills/pre-push/SKILL.md` Step 5b (whose "not yet implemented" blockquote comes back out when this lands).

**Implementation steps:**
1. Scope to the push's own commit range (`origin/<branch>..HEAD`), collecting changed `packages/db/migrations/*.sql`.
2. For each, parse every `-- VERIFY: <sql predicate>` line. **A changed migration with no `-- VERIFY:` is a FAIL, never a pass** — "missing" means "cannot check". This is the clause that makes the convention self-enforcing.
3. Resolve the deploy target for the current branch and run each predicate against it read-only.
4. Emit exactly three outcomes, kept textually distinct: **PASS** (exit 0 — no schema-bearing files, or every predicate true); **FAIL** (exit 1 — a predicate is false, its SQL errors, or a `-- VERIFY:` is absent); **UNVERIFIED** (exit 2 — target unreachable). Print the words "Not a pass" in the UNVERIFIED branch; an unreachable target reads as success to a hurried operator otherwise.
5. Name the fix in FAIL output — the exact apply command for that file.

**Verification:** a fixture migration whose predicate is false must exit 1; the same migration applied must exit 0; a migration with no `-- VERIFY:` must exit 1 with a distinct message; an unreachable target must exit 2 and not 0. Revert-proof each. In `chenson42/npvitals` this gate has since blocked four pushes correctly, including one in the session that produced this spec.

**Classification:** backport-ready · **Risk:** low to add, high value — it is additive, and it is the only gate here that talks to the deploy target, so it cannot regress anything that passes today.
