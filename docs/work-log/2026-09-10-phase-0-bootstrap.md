# Kit Bootstrap (Phase 0) — Work Log

> **Slug:** `2026-09-10-phase-0-bootstrap`
> **Surface:** mixed (repo root, `scripts/`, `docs/`, `.claude/`, `.github/`, `packages/config`)
> **Permission(s):** none — no product code yet
> **Flag(s):** not needed
> **Estimated complexity:** large
> **Pipeline mode:** Accelerated — this is the commit that *creates* the pipeline. The
> plan that stands in for Phases 1–3 was produced in a planning session on 2026-09-10:
> three exploration passes over the four ancestor repos, external research on cross-AI
> standards, four operator decisions (app shape, mobile stack, tenancy, SSO scope), and a
> meta-layer design pass — approved by the operator before any file was written.
> Dogfooding starts here: everything after this commit follows the full pipeline this
> commit installs.

---

## Per-Phase Status

| Phase | Owner | Status | Verdict | Date |
|-------|-------|--------|---------|------|
| 1–3 — Plan (see Pipeline mode note) | operator + planning session | Done | Approved | 2026-09-10 |
| 4 — Implementation | main session + forked workers | In progress | — | 2026-09-10 |
| 5 — Verification | qa | Pending | — | — |
| 6 — Shipped vs intent | analyst | Pending | — | — |

---

# Phase 4 — Implementation

## What Phase 0 lands

- **Workspace:** `package.json` (root script surface incl. `kit:*`), `pnpm-workspace.yaml`
  (`apps/*`, `packages/*`, `docs-site`), `turbo.json`, `.nvmrc` (22), `.npmrc`
  (engine-strict), `.gitignore`, `packages/config` (tsconfig base, eslint base with the
  `toLocale*` ban).
- **Kit manifest + detection:** `kit.json`, `scripts/kit/kit.schema.json`,
  `scripts/kit/kit-check.mjs` (canonical/fork/personalized/declined state machine —
  verified by hand against the canonical, fork-simulated, and `--strict` cases).
- **Standards docs:** `AGENTS.md` (canonical, cross-tool), `CLAUDE.md` (pointer),
  `UI-STANDARDS.md`, `UX-PATTERNS.md` (incl. the binding overlay-surface ladder),
  `BRANDING.md` (seed-hex → OKLCH model, placeholder "Starter Blue" identity).
- **Docs spine:** `docs/decisions.md` (DECISION-001…006), `docs/TODO.md` (phase
  backlog), `docs/work-log/_template.md`, `docs/reviews/log.md`, this entry.
- **Claude config:** `.claude/agents/` (10-role roster), `.claude/skills/` (core skills),
  `.claude/settings.json` (SessionStart + gate hooks). *(Separate worker, same Phase 0.)*
- **Tripwires + CI:** root `scripts/` (commit-msg grammar, worklog gate, pre-push gate,
  tripwire runner), `install-hooks.sh` wired to `prepare`, `.github/workflows/ci.yml`,
  dependabot. *(Separate worker, same Phase 0.)*
- **README + LICENSE** (MIT).

## Implementer Notes

- Source material was harvested from the four ancestor repos and *generalized* — shipped
  docs carry no ancestor project names (provenance lives in `docs/decisions.md` only).
- The kit's own repo currently reports `UNPERSONALIZED` from `kit-check` because no git
  origin exists yet; it flips to `CANONICAL-OK` when the canonical GitHub remote is set.
  This was verified as correct behavior, not a bug.

## Claims Ledger

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| 1 | `kit-check` returns exit 1 only under `--strict` + UNPERSONALIZED | Verified | ran the matrix: no-origin, `GITHUB_REPOSITORY=someuser/mynewapp`, and `--strict` (exit 1) on 2026-09-10 |
| 2 | Workspace globs cover all planned packages | Verified | `pnpm-workspace.yaml` lists `apps/*`, `packages/*`, `docs-site`; plan's layout enumerates only paths under those three |
| 3 | Shipped docs contain no ancestor project names | Verified | grep sweep for npvitals/kindway/huddle/presby/fpcw/church/volunteer over root `*.md` (decisions.md exempt by design) — see Phase 5 to re-run |

## What was NOT verified

- No `pnpm install` / typecheck / build has run yet — there is no installable package
  code beyond `packages/config`. First verified green build is a Phase 1 gate.
- The `.claude/` roster and tripwire scripts land via parallel workers in this same
  Phase 0 and are not re-verified by this entry; the Phase 0 verification pass covers
  them.

---

# Phase 5 — Verification (qa)

Run 2026-09-10 after all Phase 0 workers landed, plus the Phase 1 packages spine
(delivered early, in parallel):

| Check | Result |
|---|---|
| `pnpm install` + git hooks | PASS — commit-msg, pre-commit, pre-push installed idempotently |
| Script unit tests (`node --test 'scripts/*.test.mjs'`) | PASS — 71/71 (the `scripts/` directory form of `--test` does not glob on Node 22.23; call sites fixed to the pattern form) |
| Tripwire suite (`pnpm check`) | PASS — check-instructions, check-agent-symbols, check-secrets, check-sql-date (after repointing two references from `packages/db/scripts/seed.ts` to `packages/db/src/seed.ts`) |
| Package tests | PASS — @repo/permissions 10/10, @repo/db 5/5, @repo/auth 92/92 |
| Package typecheck | PASS — `tsc --noEmit` in all three packages (verified by the packages worker) |
| docs-site build | PASS — 8 pages (after adding `sharp` for Astro image optimization) |
| `kit-check` matrix | PASS — UNPERSONALIZED (no origin), UNPERSONALIZED via `GITHUB_REPOSITORY` override, `--strict` exit 1 |
| `pnpm kit:verify` end-to-end | PASS (no git HEAD to stamp pre-commit; stamp path exercises after the first commit) |

## What was NOT verified

- No Next.js app exists yet, so turbo `typecheck`/`lint`/`build`/`test` have no app
  targets — the app-level pipeline first runs for real in Phase 2.
- `kit-check` CANONICAL-OK state — requires the GitHub repo to exist and `origin`
  to point at the canonical URL; verified after first push.
- CI workflows are authored but have never executed — first `push` to GitHub is
  their first run.
- The migrations have not been applied to a real Postgres (no database yet);
  `migrate.mjs` passed `node --check` only.
- The `.agents/skills` symlink behavior on Windows checkouts.

---

# Phase 6 — Shipped vs Intent (analyst)

Phase 0 shipped what the plan scoped, plus early pulls: the Phase 1 packages spine
and most of Phase 6's docs-site (skeleton, 7 content pages, Pages workflow, brand
imagery). Deviations: none against approved decisions. Residual risks are the
NOT-verified items above, all of which have named later-phase gates. SHIP IT for
the Phase 0 commit.
