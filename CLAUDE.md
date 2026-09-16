@AGENTS.md

# Claude-specific notes

Everything binding lives in `AGENTS.md` (imported above). The notes below only cover
tooling that exists for Claude Code specifically.

- **Hooks** are wired in `.claude/settings.json`: SessionStart runs the kit-check banner
  and `kit:status` digest; PreToolUse gates enforce work-log-before-code and
  personalize-before-edit; a Bash gate blocks `git push` without a fresh pre-push stamp.
  These are the fast-feedback layer — the same rules are enforced tool-agnostically by git
  hooks and CI, so never treat a missing hook as permission.
- **Agent roster** lives in `.claude/agents/` — one file per pipeline role (see AGENTS.md →
  Development Pipeline). Judgment agents (analyst, architect, qa) are tool-restricted to
  read-only.
- **Model tiering** is set per agent in frontmatter (`model:`), rationale in
  `docs/decisions.md` → DECISION-007. `fable` for the two verdict gates whose failure mode
  is rubber-stamping (analyst, qa); `opus` for design and for implementers whose mistakes
  are expensive to reverse (architect, tech-lead, api-developer, database-admin,
  mobile-developer); `sonnet` for contract-driven, well-audited implementation
  (ux-developer, full-stack-developer, deployment-engineer). Override per invocation with
  the Agent tool's `model` parameter when a task is unusually hard or unusually routine.
- **Skills** live in `.claude/skills/` and are invocable as slash commands (`/new-feature`,
  `/pre-push`, `/personalize`, `/upstream-sync`, …). They follow the cross-tool SKILL.md
  standard, so treat them as the canonical procedure definitions, not Claude-only helpers.
