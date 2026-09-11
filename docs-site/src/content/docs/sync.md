---
title: Keep Your Project in Sync with the Starter Kit
description: "Stackkeel's two-way sync between the kit and projects built from it: upstream-sync classifies new kit commits into a reviewable punch-list, and downstream-sync packages your generic fixes as contribution specs."
---

The kit and its forks stay in touch in both directions. Both are **skill-driven and review-first**: nothing is ever auto-applied.

## Upstream sync (kit → your project, 14-day cadence)

`/upstream-sync` compares your `kit.json` sync state against the canonical repo (works for true git forks *and* scaffolded copies with no shared history), then classifies each new kit commit:

- `must-pull` — security-relevant paths (`packages/auth`, `packages/db`, `packages/permissions`, the edge gates)
- `should-pull` / `optional` — everything else scaffold-shaped
- `skip` — kit-internal content, or commits entirely inside modules you removed at personalization

The output is a punch-list with conflict warnings for files you've personalized. You apply what you want; the skill records the new baseline.

A monthly GitHub Actions reminder (`kit-sync-reminder.yml`) opens a single issue in your repo when upstream commits are waiting — it never diffs or applies anything.

## Downstream sync (your project → kit, 30-day cadence)

`/downstream-sync` walks the scaffold-generic surfaces of your project and asks: what have you built or fixed that the kit should adopt? The deliverable is a **contribution kit** — an executable spec (`docs/starter-contributions/NN-slug.md` with Origin → What & why → Applies to the kit as → Steps → Verification), not a patch. Specs travel better than patches because the kit's own assistant can re-implement them against the kit's layout. Send them to the canonical repo as a PR into `docs/starter-contributions/incoming/`.
