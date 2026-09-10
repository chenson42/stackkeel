---
title: Getting Started
description: From template copy to running app.
---

## Prerequisites

- Node 22+ (`.nvmrc` is set; `nvm use`)
- pnpm 10+
- A Postgres database (Neon recommended; local Postgres works via `DATABASE_URL`)

## Steps

1. **Copy the template.** Use GitHub's "Use this template" on `chenson42/starterkit` (or fork/clone) and point `origin` at your new repository.
2. **Install.** `pnpm install` — this also installs the git hooks (commit grammar, work-log gate, pre-push verification).
3. **Personalize.** Open the repo in your AI assistant. The session-start check detects an unpersonalized copy and directs you to run the `personalize` skill (`.claude/skills/personalize/SKILL.md` — readable by any Agent Skills-compatible tool). It interviews you for identity and branding, asks **which apps and features you actually need**, strips the rest, and records everything in `kit.json`. Without an assistant: `pnpm kit:check --why` explains the state; the skill file is a runnable checklist.
4. **Configure env.** Copy `.env.example` to `.env.local` and fill in the values the personalization report lists (database URL, `AUTH_SECRET`, TOTP encryption key, Google OAuth, initial admin emails).
5. **Migrate + seed.** `pnpm --filter @repo/db migrate && pnpm --filter @repo/db seed`
6. **Run.** `pnpm dev` — portal on :3000, admin on :3001.

## Deliberately opting out

If you're using the kit as a reference rather than a product base, set `identity.personalizationDeclined: true` in `kit.json` to silence the gate.
