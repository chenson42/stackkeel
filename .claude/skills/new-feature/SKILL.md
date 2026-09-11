---
name: new-feature
description: Walk a new feature through the 6-phase pipeline — gather intent, kick off Phase 1, and produce a work-log entry before any code is written
argument-hint: "[app] [feature-name]"
---

# New Feature

When the user invokes `/new-feature`, do not write implementation code. Instead, gather intent, scaffold a work-log entry, and hand off to Phase 1 of the pipeline.

The feature name may be provided as `$ARGUMENTS`. **First establish which app(s) this targets** — any directory under `apps/` (enumerate `apps/*` rather than assuming the kit's original four; forks add apps), or a shared `packages/*` change — if it isn't already obvious from context.

## The Pipeline

Every feature flows through the same six phases (see `AGENTS.md` for the full definition). At a glance:

| Phase | Owner | Output |
|-------|-------|--------|
| 1 — Functional refinement | `analyst` | User-verbs, flows, gaps the request didn't address |
| 2 — Architectural review | `architect` | Verdict on where the work lives (app/package placement) and whether dependencies are needed |
| 3 — Technical design | `tech-lead` | Design doc with API contract, data model, implementation order |
| 4 — Implementation | `database-admin`, `api-developer`, `ux-developer`, `full-stack-developer`, or `mobile-developer` | Working code, schema changes, audit events |
| 5 — Verification | `qa` | Type check, unit tests, e2e tests, PASS / FAIL / BLOCKED verdict |
| 6 — Shipped vs intent | `analyst` | Final SHIP IT verdict comparing the build to the Phase 1 description |

A SHIP IT from Phase 6 is the only verdict that closes a feature.

## Step 1: Gather Intent

Ask the user (if not already provided):

1. **App(s)** — any app under `apps/` (list the directory, don't assume the original four), or shared `packages/*`. A feature with a member surface and a triage surface (like the helpdesk) spans portal + admin in one entry; a shared-package change names every consuming app it will alter.
2. **Feature name** — short, slug-friendly (e.g., "api keys", "ticket attachments").
3. **Surface** — public, member-only, admin-only, native-only, or a mix.
4. **Value** — why this feature matters. The problem it solves or the user need it serves. *Required.*
5. **User verbs** — what does the user *do*? (See the analyst agent's Phase 1 rubric.)
6. **Auth gate** — does it need a new `FEATURES` key? Which roles get it? Should it ship behind a feature flag? (Permissions and flags are distinct — AGENTS.md → Key Invariants.)
7. **Audit-relevance** — does any flow mutate security-sensitive state (users, roles, 2FA, devices, flags)? If so, the implementer must call `recordAudit()`.
8. **Complexity estimate** — small (one afternoon), medium (a day or two), or large (a week or more).

## Step 2: Create the Work-Log Entry

Today's date is the slug prefix. Create the entry in the single root work-log tree from its template:

```bash
cp docs/work-log/_template.md docs/work-log/YYYY-MM-DD-<feature-slug>.md
```

Then edit the new file to set:

- **Slug**, **Title**, **App(s)**, **Surface**, **Permission(s)**, **Flag(s)**, **Estimated complexity**.
- The **Per-Phase Status** table starts with Phase 1 as "In progress" and everything else "Pending".
- The **Phase 1 — Functional Refinement** section is the next thing to write.

## Step 3: Recommend Pipeline Mode

Based on complexity, recommend a mode:

- **Small** — accelerated pipeline. Phase 1 brief; Phase 2 may be skipped if the work is obviously within existing structure/convention; Phase 3 may be a paragraph; Phase 4 + 5 + 6 still run.
- **Medium** — full pipeline.
- **Large** — full pipeline, and break the work into multiple work-log entries (one per shipping increment).

**A small feature is not a skip.** It's a speed optimization. Phases 4, 5, and 6 always run.

## Step 4: Hand Off to Phase 1

Tell the user: "Phase 1 starts now. I'll invoke the analyst agent to refine [feature name] before tech-lead designs it."

Then invoke the `analyst` agent with the user's intent description and the target app(s). The analyst writes the Phase 1 section of the work-log.

## Important

This skill **never writes implementation code**. It produces the work-log entry and hands off. The first line of actual code is written in Phase 4, after Phase 3's design exists.

## Summary

When you finish, the user should see:

- A new file at `docs/work-log/YYYY-MM-DD-<slug>.md` with the metadata block filled in.
- Phase 1 status set to "In progress".
- A clear pointer to the next step ("invoke analyst").
- Estimated path through the pipeline and which agents will be involved.
