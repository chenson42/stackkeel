---
name: upstream-sync
description: Review canonical-kit commits since this fork's baseline and produce a classified punch-list (must-pull / should-pull / optional / skip). Works for true git forks AND scaffolded copies with no shared history. Cadence 14 days; the canonical kit repo detects itself and exits.
---

# Upstream Sync

Surface which commits have landed on the canonical kit's `main` since this fork's last
sync, classify each, and log the result. **This skill never applies commits** — it
produces a punch-list the fork owner reviews before any `git` operation.

Two supported repo kinds:

1. **True git fork** — shared history exists; the baseline comes from `git merge-base`.
2. **Scaffolded copy** (GitHub "Use this template", clone-then-detach) — no shared
   history; the GitHub-API path (`MODE=gh`) queries the canonical commit list directly
   and needs only a baseline SHA or date.

"Baseline" = the canonical commit this project last matched. State lives in
`kit.json` → `sync.upstream` (`baselineSha`, `lastSyncedSha`, `lastSyncedDate`).
The canonical URL comes from `kit.json` → `kit.canonicalUrl` — never hardcode it.

## Known Untested Paths (read this first)

Developed inside the canonical repo, where pre-flight short-circuits to N/A. Everything
below is structurally verified but has never run against a live fork↔kit pair: the
`gh api` commit+files fetches, the git fallback, classification on real subjects, the
punch-list rendering, conflict flagging against `paths.personalized`, and the
module-removed skip rule. If you are the first fork owner running this, you are the
first real test — report failures as issues on the canonical repo.

## Pre-flight (all three; exit cleanly on failure, write nothing)

1. **Self-detection.** Run `pnpm kit:check --why`. If it reports the canonical kit
   repository, print `upstream-sync: canonical kit repo — skipping (N/A).` and stop.
2. **Tooling.** `gh auth status` OK → `MODE=gh`. Else an `upstream` git remote →
   `MODE=git`. Neither → tell the user to install `gh` or
   `git remote add upstream <kit.canonicalUrl>` and stop.
3. **State.** Read `kit.json` → `sync.upstream`. Empty `baselineSha` → first-run
   bootstrap (below). Populated → fetch step.

## First-run bootstrap (empty baselineSha)

Resolve a baseline with the first strategy that applies, then write it to
`kit.json.sync.upstream` (`lastSyncedSha` = baseline; `lastSyncedDate` = fork/scaffold
date if known, else today — it seeds the `since=` window, so prefer the real date):

1. **Shared history** (`MODE=git`): `git fetch upstream && git merge-base HEAD upstream/main`.
2. **User-supplied SHA**: ask what canonical commit the project was scaffolded from.
3. **Date-based**: ask for an approximate scaffold date (err earlier), then
   `gh api "repos/<owner>/<repo>/commits" -X GET -f sha=main -f until=<date>T23:59:59Z --jq '.[0].sha'`.
4. **Latest canonical** (last resort, with an explicit warning that only future commits
   will surface): `gh api repos/<owner>/<repo>/commits/main --jq '.sha'`.

## Fetch (max 50 commits per run, oldest first)

- `MODE=gh`: `gh api "repos/<owner>/<repo>/commits" --paginate -X GET -f sha=main -f since=<lastSyncedDate>`
  for the list, then `gh api "repos/<owner>/<repo>/commits/<sha>" --jq '[.files[]?.filename]'`
  per commit for files. Filter out `lastSyncedSha` itself.
- `MODE=git`: `git fetch upstream && git log <lastSyncedSha>..upstream/main --format="%H|%ai|%an|%s" --name-only`.
  If `lastSyncedSha` is missing from upstream/main (rebase/force-push), ask for a new
  baseline and stop.

## Classify (first match wins; unmatched → optional)

| Class | Signals |
|---|---|
| `must-pull` | subject/body mentions security/CVE/vulnerability/exploit; OR `fix:` touching `packages/auth/`, `packages/db/`, `packages/permissions/`, or any `apps/*/src/proxy.ts` |
| `should-pull` | `fix:` or "defect"; files under `apps/`, `packages/`, or `scripts/` |
| `optional` | `feat:` or `chore: deps`; new files under `apps/` or `packages/` |
| `skip` | `docs:`/`style:`/`ci:`/non-deps `chore:`; **or** every file falls under `kit.json.paths.kitInternal`; **or** every file falls under some `kit.json.paths.removed[].paths` — render as `skip (module removed: <name>)` |

**Conflict flagging:** if `commit.files ∩ kit.json.paths.personalized` is non-empty,
add `conflictLikely` with the intersecting paths (additive; classification unchanged).

## Punch-list, then log

Render a Markdown table (`# | SHA(7) | Date | Subject | Classification | Conflict? | Files`)
and show it before writing anything. Empty list → say so. Then:

- Append `YYYY-MM-DD | upstream-sync | N commits reviewed (X must, Y should, Z optional, W skip)`
  (or `nothing new since last sync`) to `docs/reviews/log.md`.
- If N > 0, write the full table to `docs/reviews/YYYY-MM-DD-upstream-sync.md`.
- Update `kit.json.sync.upstream`: `lastSyncedSha` = newest processed (full SHA),
  `lastSyncedDate` = today.
- Any failure before the fetch completed: write NOTHING.
