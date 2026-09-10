# Decisions

Architectural decision log. Newest first, numbered. Every entry states the decision, the
alternatives rejected, and why — with provenance where a decision was harvested from a
prior project.

---

## DECISION-006: Enforcement lives in git hooks + CI; assistant hooks are fast feedback only

**Date:** 2026-09-10

Every load-bearing workflow gate — commit grammar, work-log-before-code, pre-push
verification, personalization state — is enforced by git hooks (installed via `pnpm
install` → `prepare`) and re-validated in CI. Claude Code hooks re-implement some of them
as earlier, friendlier feedback, but no rule depends on them. Rejected: Claude-hooks-only
enforcement (the ancestor repos' model), because this kit targets cross-AI development —
Codex, Copilot, Cursor, and Gemini sessions must hit the same walls. A closely related
regression this guards against: one ancestor monorepo shipped with zero CI for months
while its docs claimed CI enforcement.

## DECISION-005: Mobile = Capacitor thin shell + Expo native app, both optional modules

**Date:** 2026-09-10

`apps/shell` is a Capacitor 8 thin shell that loads the *deployed portal URL* (not a
bundled webDir) — native Google Sign-In and push arrive via small native plugins, and the
portal detects the shell at runtime. `apps/mobile` is an Expo (expo-router) app consuming
the portal's REST API with opaque device tokens (6-digit pairing, secure-store storage,
typed API errors, offline queue). Rejected: bare React Native (a prior project proved it
works but carries heavy native maintenance; its kiosk/silent-install patterns are kept as
reference docs, not shipped code); a single hybrid app (the thin shell and the true
native app solve different problems — wrapper reach vs. native UX — and personalization
lets a fork keep either, both, or neither). Provenance: huddleup.health (shell +
web-bridge + native version gating), fpcw-directory (device pairing and token model).

## DECISION-004: Single-tenant data model; multi-tenancy is a documented upgrade path

**Date:** 2026-09-10

One deployment serves one organization. Tickets, branding, flags, and feedback are
app-scoped, not org-scoped; there is no `organization_id` column, no RLS, no dual DB
connection. Rejected: lifting the multi-tenant model (orgs + FORCE RLS + composite tenant
keys) from the presby ancestor — it is the strongest implementation in the family but
taxes every fork with Postgres RLS complexity that most will never need. The helpdesk and
brand engine are adapted down from it; the upgrade path is documented rather than built.

## DECISION-003: One kit manifest (`kit.json`) + one detection script drive personalization state

**Date:** 2026-09-10

`kit.json` at the repo root unifies what the ancestors kept in
`.claude/upstream-state.json`, `.claude/downstream-state.json`, and three overlapping
path lists (`personalizedPaths`, `appSpecificPaths`, `outOfScopePaths`) into a single
schema-validated manifest: identity (canonical/fork/personalized/declined), module
selection, path classes (`kitInternal` marks dogfooding content; `removed` records
stripped modules), and sync state. `scripts/kit/kit-check.mjs` derives the working copy's
true state from the manifest plus the git origin — an unedited copy still claiming
`role: canonical` with a non-canonical origin *is* the detection signal, which makes
"Use this template", fork, and plain clone converge without any copy-mode-specific
logic. Four consumers, one script: Claude SessionStart banner, a personalize edit gate,
`pnpm kit:check`/`predev`, and CI `--strict`. Rejected: hook-only detection (invisible to
non-Claude assistants) and package-name comparison alone (defeated by half-done manual
renames — kept only as a secondary warning).

## DECISION-002: AGENTS.md is canonical; CLAUDE.md is a pointer; skills are the portable workflow layer

**Date:** 2026-09-10

Instruction content lives in `AGENTS.md` (the Linux Foundation-stewarded cross-tool
standard, read natively by ~28 tools); `CLAUDE.md` is an `@AGENTS.md` import plus
Claude-only notes. Skills stay in `.claude/skills/` — per the Agent Skills open standard
(agentskills.io) that path is the *most widely read* skills location today — with a
`.agents/skills` symlink for tools that scan only the neutral path. `.claude/agents/`
remains Claude-native, so AGENTS.md describes the six-phase pipeline tool-neutrally for
assistants that must play the roles manually. Rejected: content-in-CLAUDE.md with an
AGENTS.md shim (the ancestors' model — backwards for a cross-AI kit) and duplicating
content into per-tool files (guaranteed drift).

## DECISION-001: Two web apps + shared packages, in a pnpm/Turborepo monorepo

**Date:** 2026-09-10

`apps/portal` (member-facing) and `apps/admin` (control plane) are separate Next.js apps
sharing `packages/{db,auth,permissions,brand,tokens,ui,config}`. A shared JWT session
across both apps provides portal↔admin SSO; the header `AppSwitcher` moves between them.
Rejected: a single app with route groups (weaker isolation, no true multi-app story, and
the admin surface inevitably bloats the member bundle); npm/yarn without a task runner.
Provenance: the npvitals monorepo proved the shape, including its main defect to avoid —
repo-wide hook scripts living inside one app's directory. All root-scoped scripts live in
`scripts/` here.
