# Stackkeel

![Stackkeel banner](docs-site/public/banner.png)

**Production-ready apps. AI-native development. No model lock-in.**

Stackkeel is an open-source Next.js monorepo starter kit built for AI-assisted
software development. Start with a production-ready portal, admin app,
authentication, RBAC, audit logging, queued email, a helpdesk, dynamic theming, and
mobile foundations. Then build with Claude Code, Codex, GitHub Copilot, Cursor,
Gemini CLI, or any assistant that reads [AGENTS.md](https://agents.md) and
[Agent Skills](https://agentskills.io).

[![CI](https://github.com/chenson42/stackkeel/actions/workflows/ci.yml/badge.svg)](https://github.com/chenson42/stackkeel/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/chenson42/stackkeel)](https://github.com/chenson42/stackkeel/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen)

**[Documentation](https://stackkeel.org)** ·
**[Get started](https://stackkeel.org/getting-started/)** ·
**[Why Stackkeel](https://stackkeel.org/why-stackkeel/)**

## Why Stackkeel?

1. **You don't start from an empty repo.** Auth (credentials, Google, native Google
   ID-token, generic OIDC), TOTP 2FA, account lockout, roles and permissions with
   anti-lockout guarantees, an audit log with CI-enforced coverage, feature flags, a
   retrying email queue, a real support-ticket system, runtime theming with WCAG
   contrast guarantees, and device-token mobile auth are already built and tested.
2. **The AI workflow lives in the repository.** A six-phase pipeline (analyst →
   architect → tech lead → implementer → QA) with work logs, evidence discipline,
   and gates enforced by git hooks and CI, not by any one assistant's goodwill.
3. **No model lock-in.** Instructions in `AGENTS.md`, procedures as Agent Skills,
   enforcement in git + CI. Use Claude today and Codex tomorrow; the project treats
   them identically.

## What you get

| | |
|---|---|
| **Apps** | `apps/portal` (member-facing) · `apps/admin` (control plane) · `apps/shell` (Capacitor iOS/Android) · `apps/mobile` (Expo) |
| **Identity & security** | NextAuth v5, TOTP 2FA + recovery codes, lockout, rate limiting, OIDC slot |
| **Access control** | Feature catalog in code, role matrix UI, admin anti-lockout |
| **Operations** | Append-only audit log, feature flags, health endpoints, cleanup crons |
| **Communication** | Queued email (retry/backoff, delivery webhooks), What's New announcements |
| **Support** | In-app feedback, promote-to-ticket, threaded helpdesk with triage queue |
| **Branding** | One seed color → WCAG-safe light/dark themes, admin branding editor |
| **Stack** | Next.js 16 · React 19 · TypeScript · Tailwind 4 · Drizzle + Postgres · Turborepo + pnpm · Vitest + Playwright |

The kit has a lifecycle, not just a download: personalization strips the modules
you don't want, `/upstream-sync` pulls kit improvements as a reviewable punch-list,
and `/downstream-sync` packages your generic fixes for contribution back.

## Works with

Claude Code · OpenAI Codex · GitHub Copilot · Cursor · Gemini CLI, and any other
tool that reads AGENTS.md and the Agent Skills `SKILL.md` format.
[How the cross-assistant layer works.](https://stackkeel.org/cross-ai/)

## Quickstart

```bash
# 1. Copy the template (GitHub "Use this template"), then:
pnpm install          # also installs the git hooks
# 2. Open the repo in your AI assistant — it detects the fresh copy and
#    walks you through /personalize (identity, apps, features, branding).
# 3. Configure .env.local from .env.example, then:
pnpm --filter @repo/db db:migrate && pnpm --filter @repo/db db:seed
pnpm dev              # portal :3000, admin :3001
```

Requirements: Node ≥ 22, pnpm 10, Postgres (Neon recommended). Optional services
(Resend, Upstash, Turnstile, Google/OIDC credentials) degrade gracefully when
unconfigured.

## Status

v0.1, September 2026. New, and built end-to-end by the workflow it ships: every
feature went through the six-phase pipeline, and the release was verified with
~1,200 unit tests plus Playwright smoke suites against a live Postgres.

MIT licensed. Contributions arrive as
[contribution-kit specs](https://stackkeel.org/sync/) via PR.
