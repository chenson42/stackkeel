---
name: downstream-sync
description: Review what this fork has built that the canonical kit should adopt, and package each candidate as a contribution-kit spec (executable by the kit's own assistant). Cadence 30 days; the canonical kit repo detects itself and exits. Never opens a PR itself.
---

# Downstream Sync

The mirror of `/upstream-sync`: walk this fork's **kit-generic surfaces**, find changes
the canonical kit should adopt (bug fixes in scaffold code, hardened checks, new
reusable components, workflow improvements), and author **contribution kits** — one
spec file per candidate. The deliverable is a spec, not a patch: a spec the kit's own
assistant can execute travels better than a diff that assumes this fork's layout.

## Pre-flight

1. **Self-detection.** `pnpm kit:check --why` reports canonical → print
   `downstream-sync: canonical kit repo — skipping (N/A).` and stop.
2. **State.** Read `kit.json` → `sync.downstream` (`lastCheckedDate`, `proposed[]`)
   and `kit.json` → `paths.appSpecific` (this fork's product surfaces — never
   candidates). `paths.personalized` entries are identity, not contributions.

## Known Untested Paths

Same caveat as upstream-sync: structurally verified, never run against a live fork.
First fork owner to run this is the first real test.

## Step 1 — Enumerate kit-generic surfaces

Walk, in this order (skip anything under `paths.appSpecific` or `paths.personalized`):

- `scripts/` (tripwires, kit tooling) and `.github/workflows/`
- `packages/{auth,db,permissions,ui,tokens,brand,config}/` — generic infrastructure only
- `apps/*/src/proxy.ts`, shared components under `apps/*/src/components/shared/`
- `.claude/skills/` and `.claude/agents/`
- `AGENTS.md`, `UI-STANDARDS.md`, `UX-PATTERNS.md`, `BRANDING.md` — generic sections

For each, diff against the baseline (`git log <sync.upstream.baselineSha>.. -- <path>`
when history is shared; otherwise reason from the fork's own commit history) and
collect changes that are **generic** — they would help every fork, not just this
product.

## Step 2 — Classify candidates

| Class | Meaning |
|---|---|
| `backport-ready` | Drops into the kit with path adjustments only |
| `needs-generalization` | Sound idea, fork-specific shape (names, schema, deps) |
| `structural-proposal` | Changes how the kit itself is organized — needs kit-side judgment |
| `skip` | Product-specific, superseded upstream, or already in `proposed[]` and unchanged since |

## Step 3 — Author contribution kits

For each non-skip candidate, write `docs/starter-contributions/NN-<slug>.md`:

```
# NN — <title>
Origin: <fork commit(s) / work-log>
What & why: <the problem and the fix, 3–8 sentences>
Applies to the kit as: <where it lands in the kit's layout>
Implementation steps: <numbered, executable by the kit's assistant>
Verification: <how the kit proves it works>
Classification: <class> · Risk: <low/medium/high + why>
```

Number sequentially from the highest existing NN. Submit by PR into the canonical
repo's `docs/starter-contributions/incoming/` — this skill **never opens the PR**;
it tells the user the exact `gh pr create` invocation to run if they want it.

## Step 4 — Log + state

- Append `YYYY-MM-DD | downstream-sync | N candidates (A ready, B needs-gen, C structural)`
  (or `nothing to contribute`) to `docs/reviews/log.md`.
- Update `kit.json.sync.downstream`: `lastCheckedDate` = today; add each authored
  candidate to `proposed[]` as `{slug, date, class}` so the next run skips it unless
  the underlying code changed again.
- Failures before Step 1 completes: write nothing.
