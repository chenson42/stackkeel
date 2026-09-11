---
title: Stackkeel vs. create-next-app, T3, and SaaS Boilerplates
description: "How Stackkeel compares to create-next-app, create-t3-app, MakerKit, and other Next.js starter kits: what each gives you on day one, and where an AI-native development workflow changes the picture."
---

*Comparison reviewed September 2026 against each project's own documentation:
[create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app),
[create-t3-app](https://create.t3.gg/), [MakerKit](https://makerkit.dev/),
[TurboStarter](https://www.turbostarter.dev/). If something here has gone stale,
[open an issue](https://github.com/chenson42/stackkeel/issues).*

The honest starting point: if you want a minimal framework scaffold, use
`create-next-app`. If you want end-to-end type safety and nothing else decided for
you, `create-t3-app` is excellent. Stackkeel occupies a different spot. It is an
application foundation with a development process attached, built for teams that do
most of their coding through AI assistants.

## The short version

| | Framework scaffold | Typed scaffold | SaaS boilerplate | Stackkeel |
|---|---|---|---|---|
| Example | create-next-app | create-t3-app | MakerKit, TurboStarter | — |
| You get | Next.js | Next.js + tRPC + Prisma/Drizzle + auth wiring | Apps + billing + auth + admin | Apps + auth + RBAC + audit + email + helpdesk + theming + mobile |
| Admin control plane | no | no | usually | yes, a separate app |
| Native mobile | no | no | sometimes (Expo) | Capacitor shell and Expo app |
| AI workflow | none | none | none | six-phase pipeline, any assistant |
| Update path after you fork | none | none | varies | classified upstream sync + contribution kits |
| Removing what you don't need | n/a (nothing to remove) | choices at init | manual deletion | registry-driven module stripping |
| License | MIT | MIT | mixed free/paid | MIT, free |

## What actually differs

**Scope.** `create-next-app` gives you a framework. A boilerplate gives you a
product skeleton. Stackkeel gives you working platform features (authentication with
TOTP 2FA, roles and permissions with an anti-lockout floor, an audit log, a queued
email system, a helpdesk, runtime theming, device-token auth for native clients)
plus the operational glue most kits leave out: migrations discipline, scheduled
cleanup, health endpoints, secrets and audit-coverage tripwires.

**The workflow is part of the product.** Every kit hands you code. Stackkeel also
hands you the process for changing it: a [six-phase pipeline](/workflow/) any AI
assistant can run, with the load-bearing gates in git hooks and CI rather than in
one vendor's tool. If your team builds primarily with Claude Code, Codex, Copilot,
Cursor, or Gemini CLI, this is the difference that compounds. See
[One Workflow, Any AI](/cross-ai/).

**Life after day one.** Most starter kits end their relationship with you at
`git clone`. Stackkeel treats the fork relationship as ongoing:
[personalization](/personalization/) strips modules you decline, upstream sync
classifies later kit improvements into a reviewable punch-list, and downstream sync
packages your generic fixes as specs the kit can adopt. See
[Kit ↔ Fork Sync](/sync/).

## When Stackkeel is the wrong choice

- You want a minimal scaffold and intend to make every architectural decision
  yourself.
- You need built-in billing today. Stackkeel does not ship Stripe integration;
  MakerKit and similar paid boilerplates do.
- Your product is a static site or a content site. This kit is shaped for
  authenticated application software with an admin surface.
- You disagree with the opinionated stack (Next.js, Drizzle, NextAuth, Tailwind,
  Postgres). The opinions are the value here; fighting them is not.
