---
name: pre-push
description: Run pre-push verification across the workspace — typecheck, tripwires, unit tests, lockfile sync, build, migration checks, release notes, and a housekeeping sweep — before pushing to main
---

# Pre-Push Checks

When the user invokes `/pre-push`, run every verification step required before pushing to `main`. This skill never pushes — it only reports readiness and stamps the marker the push gate reads. **Establish what the outgoing commits touch first:**

```bash
git diff main...HEAD --name-only | cut -d/ -f1-2 | sort -u
```

A push can touch any combination of `apps/portal`, `apps/admin`, `apps/shell`, `apps/mobile`, `packages/*`, `scripts/`, and docs. Run every touched surface's section and report each verdict before answering "ready to push? yes/no" for the push as a whole. **A `packages/*` change counts as touching every app that consumes it.**

## Step 0: Check for an Open Test File (HARD STOP)

```bash
ls docs/pre-merge-tests-v*.md 2>/dev/null && echo "EXISTS" || echo "CLEAR"
```

If any such file exists: **STOP.** Tell the user which file was found and that `/test-results` must close it before pushing.

## Step 1: Snapshot the Current State

Run, in parallel: `git status`, `git log --oneline -10`, `git branch --show-current`. Confirm what branch we're on, what's staged/unstaged, and what commits will be in the push.

**If there are uncommitted changes:** STOP. Ask the user whether to commit them first or abort.

## Step 2: Sync with `main` (if on a feature branch)

```bash
git fetch origin main
git log HEAD..origin/main --oneline
```

If `main` has new commits, ask the user whether to merge before continuing — don't merge unilaterally.

## Step 3: Type Check, Lint, Tripwires, Unit Tests

Per touched web app (`pnpm --filter <app> run <script>` — never the bare form from the root; it resolves against the wrong `package.json`):

```bash
pnpm --filter portal run typecheck && pnpm --filter portal run lint && pnpm --filter portal test
pnpm --filter admin run typecheck && pnpm --filter admin run lint && pnpm --filter admin test
```

**If the push touches `packages/*`**, run the changed package's OWN test suite AND the full gate for **every consuming app** — a shared-package change compiles in one app and breaks another routinely, and no app's suite includes any `packages/*` spec file:

```bash
pnpm --filter @repo/auth test          # if packages/auth touched
pnpm --filter @repo/db test            # if packages/db touched
pnpm --filter @repo/permissions test   # if packages/permissions touched
pnpm --filter @repo/brand test         # if packages/brand touched
pnpm --filter @repo/ui test            # if packages/ui touched
```

(`@repo/config` and `@repo/tokens` have no test scripts — do not invent them; changes there are covered by the consuming apps' suites.)

**Root tripwires, run once for any push:**

```bash
pnpm run check    # scripts/run-tripwires.mjs — audit coverage, sql-date, secrets,
                  # brand-scope, agent symbols, instruction freshness, worklog discipline
```

Root `pnpm test` (`turbo run test`) runs every suite at once and is a valid substitute for the per-filter commands above.

Do not proceed if typecheck, lint, tripwires, or unit tests fail.

## Step 3b: Lockfile Sync — the check that catches deploy-only failures

```bash
pnpm install --frozen-lockfile
```

A local `pnpm install` is NOT frozen — it happily reconciles a changed `package.json` against a stale `pnpm-lock.yaml` and moves on. The deploy platform's install IS frozen. So a dependency added to any `package.json` without committing the regenerated lockfile passes every local gate and then fails every deploy in seconds with `ERR_PNPM_OUTDATED_LOCKFILE`. Run this whenever a push touches ANY `package.json`. It is the only step here that tests what the deploy actually does rather than what your machine does.

## Step 4: Production Build

```bash
pnpm --filter portal run build     # if portal (or a package it consumes) touched
pnpm --filter admin run build      # if admin (or a package it consumes) touched
```

`next build` does its own type pass and catches things `tsc --noEmit` alone won't. Native apps: a shell/mobile change gets at minimum a native compile check (see `mobile-developer.md`) — `pnpm build` cannot verify Swift/Kotlin.

## Step 5: Schema and Migration Check

All schema lives in `packages/db`. If the push touches `packages/db/src/schema/` or `packages/db/migrations/`:

```bash
git diff main -- packages/db/src/schema/
git diff main -- packages/db/migrations/
```

If a schema file changed with no matching committed migration, run `pnpm db:generate`, review the emitted SQL, confirm it carries the correct `-- MODULE:` header and a `-- VERIFY:` predicate, and commit it alongside the schema change.

## Step 5b: Schema Prerequisite Gate (whenever a migration file is in the outgoing diff)

> **This gate is not yet implemented** (2026-09-11): `scripts/check-schema-prerequisites.mjs` is not yet implemented and running it fails with *Cannot find module*.
> The design below is settled and the `-- VERIFY:` convention it depends on is
> already in use in `packages/db/migrations/`. Until the script lands, check by
> hand that every migration in the outgoing diff has actually been applied to
> the deploy target, and say so explicitly in the summary.

```bash
node scripts/check-schema-prerequisites.mjs   # not yet implemented
```

Step 5 compares schema files to the *committed migration set*; nothing there checks whether a committed migration has actually been *applied* to the environment this branch deploys to — this gate is that check. It runs each changed migration's `-- VERIFY: <sql predicate>` against the deploy target. Three outcomes — do not treat the last two as clear to push:

- **PASS** (exit 0) — no schema-bearing files changed, or every predicate verified true.
- **FAIL** (exit 1) — a predicate is false, its SQL errors, or a changed migration has no `-- VERIFY:` at all. The output names the file and the fix.
- **UNVERIFIED** (exit 2) — the target could not be reached. Not a pass — treat as FAIL for "ready to push?" and tell the user why.

## Step 6: Release Notes and Version Bump

**Required before every push to `main` that introduces a user-visible code change.**

1. Read the root `package.json` for the current version.
2. Read the most recent `docs/release-notes/vX.Y.md` entry (sort numerically — lexicographic `ls` puts `v0.9` after `v0.10`).
3. Run `git log origin/main..HEAD --oneline` to list the commits being pushed.
4. Invoke `/release-notes` to write or extend the entry and bump the version.
5. Commit the release-notes change so it goes out with the push.

Documentation-only changes don't need a version bump. All code changes on a branch ship as a single version — combine entries.

## Step 7: Housekeeping Sweep (advisory)

- **New environment variables?** Documented in `.env.example` (the canonical inventory) and AGENTS.md if operationally notable?
- **New tables/columns?** In `packages/db` with a generated, MODULE-headed, VERIFY-carrying migration?
- **New routes/actions?** Auth + feature gate present on every protected entry?
- **`docs/TODO.md` reconciled?** If the outgoing commits ship/defer/discover work, `docs/TODO.md` must move/gain the corresponding line in the same commits (Workflow Rules).
- **No stray debug logs:** `grep -rn "console.log" apps/*/src packages/*/src --include="*.ts" --include="*.tsx" | grep -v "// "`
- **No native browser dialogs:** `grep -rEn "alert\(|confirm\(|prompt\(" apps/*/src --include="*.ts" --include="*.tsx"`
- **No env files staged:** `git diff --name-only | grep -E "\.env"`

## Step 8: Dependency CVE Audit (whole workspace, once)

```bash
pnpm audit --audit-level=moderate
```

(`pnpm audit` resolves the whole workspace lockfile — one run at the root; it is not a filterable command.) **PASS** — none, or `info` only. **WARN** — `moderate` only; list advisory IDs. **FAIL** — any `high`/`critical`; list advisory IDs and ask the user whether to block the push. Registry unreachable → `WARN (registry unreachable)` and continue.

## Step 9: E2E (locally; informational)

E2E runs in CI against an ephemeral database branch, and locally via each web app's `test:e2e` (each declares a `webServer` block on a dedicated e2e port, clear of the dev-port range; Next's dev-server lock is directory-scoped, so stop that app's dev server first). If the branch changed UI or auth flows, prompt the user to run the touched app's `test:e2e` before merge.

Mark this **informational** — except on auth-touching diffs, where the Phase 5 QA gate requires e2e to have actually run against a real dev server; a merely-informational skip does not satisfy that gate.

## Step 10: Summary

Report results **per touched surface**, then an overall verdict:

- Type check / Lint / Tripwires: PASS / FAIL
- Unit tests (apps + touched packages): PASS / FAIL
- Lockfile sync: PASS / FAIL / n/a
- Production builds: PASS / FAIL
- Schema and migrations: in sync / pending, with details
- Schema prerequisite gate: PASS / FAIL / UNVERIFIED, if any migration was in the diff
- Release notes + version: updated / missing
- Dependency CVE audit: PASS / WARN / FAIL (advisory IDs if any)
- E2E (informational): ran / skipped / failed
- Housekeeping warnings: list them
- **Ready to push? yes / no** — a "no" on any touched surface blocks the whole push
- If no: list each item that must be resolved first

**If the answer is yes**, stamp the pre-push marker so the push gate opens:

```bash
node scripts/pre-push-gate.mjs --stamp
```

**Run the stamp and the push as two separate commands.** A chained
`--stamp && git push` is rejected no matter what: the PreToolUse hook fires
before any part of the command string executes, so it inspects the marker that
existed *before* this command — never the one the same command was about to
create. This is distinct from the note below about committing after the stamp:
that is a valid marker invalidated by a later commit; this is a marker that
does not exist yet. Conflating them sends you back through the whole checklist
for nothing.

The PreToolUse hook that reads this marker blocks **any** in-session `git push` until a marker exists matching the current HEAD. Committing anything after the stamp invalidates it, so re-run `/pre-push` after late commits.

**Do not push.** The user pushes manually.
