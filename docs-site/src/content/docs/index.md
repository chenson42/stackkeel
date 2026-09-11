---
title: Stackkeel
description: Cross-AI monorepo starter kit with portal, admin, native shell, native app, and built-in maintenance.
template: splash
hero:
  tagline: A production-shaped monorepo template for teams that build with AI coding assistants — any of them.
  image:
    file: ../../assets/logo.png
    alt: Stackkeel mark
  actions:
    - text: Get started
      link: /getting-started/
      icon: right-arrow
    - text: GitHub
      link: https://github.com/chenson42/stackkeel
      icon: external
      variant: minimal
---

Stackkeel is a production-shaped monorepo template for teams that build with AI coding assistants — any of them. The workflow layer uses open standards ([AGENTS.md](https://agents.md) instructions and [Agent Skills](https://agentskills.io) `SKILL.md` files), so Claude Code, Codex, Copilot, Cursor, and Gemini CLI all read the same playbook, and the load-bearing quality gates live in git hooks and CI rather than in any one assistant.

## What's in the box

| Piece | What it is |
|---|---|
| `apps/portal` | Member-facing Next.js app — mobile-forward navigation, account, support |
| `apps/admin` | Control-plane Next.js app — users, roles, flags, audit, helpdesk triage, branding |
| `apps/shell` | Capacitor thin shell (iOS + Android) that wraps the deployed portal |
| `apps/mobile` | Expo native app talking to the portal's API with device tokens |
| `packages/*` | Shared db (Drizzle), auth (2FA, Google, OIDC), permissions, brand engine, UI |
| `docs-site` | This site |

## Built-in maintenance

Auth with TOTP 2FA and account lockout, roles and permissions with an anti-lockout guarantee, feature flags, an append-only audit log, a queued email system with retry and webhook observability, in-app feedback that promotes into a real helpdesk ticket system, "What's New" announcements, scheduled cleanup crons, and a dynamic OKLCH theming engine with WCAG-contrast guarantees.

## The kit lifecycle

Copy the template → the kit detects it's an unpersonalized copy and walks you through `/personalize` (pick your apps, pick your features, seed your brand) → build your product with the six-phase agent workflow → `/upstream-sync` pulls kit improvements on a cadence, and `/downstream-sync` packages your generic fixes as contribution kits to send back.
