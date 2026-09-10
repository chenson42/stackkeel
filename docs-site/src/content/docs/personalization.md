---
title: Personalization
description: How a fresh copy becomes your project.
---

Every copy of the kit starts life claiming to be `stackkeel`. The manifest at `kit.json` plus `scripts/kit/kit-check.mjs` decide what that means:

| State | Meaning |
|---|---|
| `CANONICAL-OK` | The working copy's origin **is** the canonical kit repo — this is the kit itself, being developed (the kit dogfoods its own workflow) |
| `PERSONALIZED-OK` | `identity.personalized` is true — a real project |
| `UNPERSONALIZED` | Origin points somewhere else but the identity is still the kit's — personalization required |
| `DECLINED` | You set `identity.personalizationDeclined` — reminder only |

While a copy is `UNPERSONALIZED`, the session-start banner fires in Claude Code, `pnpm dev` prints the same banner, CI's `kit-check --strict` job fails, and the edit gate blocks source changes — all four surfaces push you to the same place: the `personalize` skill.

## What the skill does

1. Refuses to run in the canonical repo; requires a clean tree.
2. Interviews you: project name, slug, description, repo URL, contact email, license.
3. **Project selection** — portal is mandatory; admin, shell (Capacitor wrapper), mobile (Expo app), and docs-site are each optional, with their operating cost stated up front.
4. **Feature selection** — helpdesk, feedback, 2FA, OIDC, email queue, What's New, flags admin UI, audit viewer. Auth core, permissions, flag infrastructure, and audit writes are not removable.
5. Branding: your seed hex runs through the OKLCH ramp generator (light and dark schemes, contrast-checked); pick one of four curated type pairings.
6. Strategic docs: vision, business plan, branding voice — provided, interviewed, or stubbed with TODOs.
7. **Stripping**: each deselected module is removed via the module registry (files, workspace entries, dependencies, migrations, flags, env vars), and the workspace must still typecheck, lint, and build after every removal — otherwise the strip rolls back.
8. Identity find-replace across the registered file list (package names, app IDs, Expo config, Capacitor config).
9. A manual-TODO report of the things only a human can do (provision the database, mint secrets, OAuth redirect URIs, store listings…).
10. Writes `kit.json`: `role: "fork"`, your module selection, the personalized/removed path records that the sync skills rely on — and leaves the diff uncommitted for your review.
