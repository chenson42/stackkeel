---
title: One AI Development Workflow, Any Coding Assistant
description: "How to structure a repository so you are not locked into Claude Code, Cursor, or Codex: AGENTS.md instructions, Agent Skills, and quality gates in git hooks and CI. Stackkeel ships this cross-assistant setup working out of the box."
---

Teams adopting AI coding tools keep hitting the same problem: the project's knowledge
ends up inside one vendor's configuration. Rules live in `.cursorrules`, or a Claude
hook, or a Copilot instruction file. Switch assistants, or just add a second one, and
the project forgets everything it knew.

Stackkeel takes the opposite position. The development process belongs to the
repository, not to any tool reading it.

## The three layers

**1. One instruction file: AGENTS.md.** The [AGENTS.md standard](https://agents.md)
is read natively by GitHub Copilot, Cursor, Codex CLI, Gemini CLI, Zed, and dozens of
other tools. Stackkeel's root `AGENTS.md` carries everything: the architecture, the
invariants, the six-phase pipeline, commit grammar, and workflow rules. `CLAUDE.md`
is a one-line pointer to it. Per-app shims add only local details like ports and
commands.

**2. One skill format: Agent Skills.** Repeatable procedures (personalize the kit,
start a feature, prepare a release, process feedback safely) are
[Agent Skills](https://agentskills.io): `SKILL.md` files with YAML frontmatter,
readable by roughly forty tools including Claude Code, Codex, Copilot, Cursor, and
Gemini CLI. They live in `.claude/skills/`, the most widely scanned location, with a
symlink at `.agents/skills` for tools that only read the neutral path. A skill is a
runnable checklist; an assistant without native skill support can simply follow it.

**3. Enforcement outside every assistant.** This is the layer most setups skip.
Instructions are suggestions; gates are guarantees. Stackkeel's binding rules live in
git hooks and CI:

| Rule | Enforced by |
|---|---|
| Commit message grammar with defect-tracking trailers | `commit-msg` hook + CI re-validation |
| A work log exists before code changes | `pre-commit` hook + CI |
| Typecheck, lint, tests, and tripwires pass before push | `pre-push` hook running `pnpm kit:verify` |
| No secrets, stale instructions, missing audit calls, or stray style tags | tripwire suite in CI |
| An unpersonalized template copy cannot ship | `kit:check --strict` in CI |

Claude Code users additionally get session hooks for fast in-editor feedback. Their
absence in another tool changes nothing about what can merge.

## What this looks like day to day

Open the repository in Claude Code and the personalization check, feedback counts,
and review cadences surface automatically at session start. Open the same repository
in Cursor or Codex and `AGENTS.md` tells the assistant to run `pnpm kit:status`,
which prints the same information. Either way, the same six-phase workflow applies,
the same work-log discipline is enforced at commit time, and the same CI verdict
decides what lands.

Model independence is also insurance. Assistants are improving quickly and pricing
shifts often. A repository that encodes its own process can follow the best tool at
any moment without a migration project.

## Try it

The [getting started guide](/getting-started/) works identically regardless of which
assistant you point at the repository. If you use several, point them all at it; they
will read the same playbook.
