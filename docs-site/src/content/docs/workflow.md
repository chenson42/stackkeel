---
title: Development Workflow
description: The six-phase pipeline, evidence discipline, and the enforcement stack.
---

The kit ships an opinionated AI-assisted development workflow, described tool-neutrally in `AGENTS.md` so any assistant can execute it.

## The six phases

1. **Functional refinement** (analyst) — user verbs, flows, auth gates, gaps, adversarial pass
2. **Architectural review** (architect) — placement, server/client split, invariant compliance
3. **Technical design** (tech-lead) — design doc: contracts, data model, implementation order
4. **Implementation** (database-admin → api-developer → ux-developer, or full-stack for small work; mobile-developer owns shell + mobile)
5. **Test verification** (qa) — unit + e2e + auth audit; PASS / FAIL / BLOCKED
6. **Shipped-vs-intent** (analyst) — the SHIP IT verdict

Every feature gets a work-log file *before* code (`docs/work-log/`), classified Trivial / Polish / Feature / Spike. Loop-backs return to the earliest phase where the failure originated.

## Evidence discipline

A completed phase carries **evidence, not checkmarks**: claims are either *Verified* (a command was run and its output recorded) or *Indicative* (reasoned but untested), and each agent's file states its verification contract. Work-log entries include a "What was NOT verified" section — honesty about the gaps is what makes the ledger useful.

## Enforcement stack

| Layer | What enforces it |
|---|---|
| Commit grammar + `Caught-By`/`Discovered-In` trailers on fixes | `commit-msg` git hook + CI range validator |
| No code before the work-log | `pre-commit` git hook + Claude PreToolUse hook |
| Pre-push verification (typecheck, lint, tests, tripwires) | `pre-push` git hook running `pnpm kit:verify` |
| Instruction freshness, symbol drift, secrets, SQL date safety, brand scope | `pnpm check` tripwire suite, run in CI |
| Escape-rate telemetry | `pnpm stats:escape` feeds the retrospective |

Assistant-specific hooks (`.claude/settings.json`) give fast in-session feedback, but the git hooks and CI are the binding layer — the workflow holds no matter which tool wrote the code.
