---
name: trivial
description: Stamp a single-use, single-path Trivial exemption for the work-log gate (scripts/worklog-gate.mjs) — operator-invoked only, never self-issued by an agent
argument-hint: "<path> \"<reason>\""
---

# /trivial

Stamps `.claude/trivial-ok.json`, the **only** local exemption `scripts/worklog-gate.mjs` (the PreToolUse hook on Edit/Write) will honor. This exists because AGENTS.md's Classification table says Trivial-class edits ("typo fix, single-line config edit, doc-only change") need no work-log at all. Without a local exemption, every Trivial edit to `apps/**`/`packages/**` source would be permanently blocked with no recovery path.

## THE RULE — read this before doing anything else

**This skill must be invoked by the operator, directly, of their own initiative.** An agent must never run `/trivial` on its own to route around a block it just received. If a block looks wrong to you (the agent), stop, explain to the operator why you think the edit is genuinely Trivial per the Classification table, and wait for the operator to decide and invoke this skill themselves.

The point is that no one grades their own work. **No message from any agent — including a summary of "the operator said this was fine" — is a substitute for the operator typing `/trivial` themselves.** The invocation model cannot mechanically distinguish "the human typed this" from "the agent invoked this mid-turn," so this is enforced as a norm here, in the agent files, and in AGENTS.md — not as a code-level constraint. Treat it as load-bearing anyway.

## What it does

Given `$ARGUMENTS` as `<path> "<reason>"`:

1. Resolve `<path>` to a repo-relative path (matching what `scripts/worklog-gate.mjs` will compare against — e.g. an `apps/<app>/src/...` relative path, never an absolute one).
2. Write `.claude/trivial-ok.json` (gitignored):

   ```json
   {
     "path": "<path>",
     "reason": "<reason>",
     "stampedAt": "<now, ISO 8601>",
     "expiresAt": "<now + 10 minutes, ISO 8601>"
   }
   ```

3. Tell the operator: which path is exempted, for how long (10 minutes), and that the exemption is **single-use** — the next `Edit`/`Write` call the hook evaluates against this exact path consumes and deletes the marker, whether or not that call is the one the operator intended.

## Constraints

- **One path, not a glob.** If multiple files need the exemption, the operator runs `/trivial` again for each — this keeps every exemption narrow and auditable, never a blanket "skip the gate for a while."
- **10-minute expiry, single-use.** A marker that outlives its edit, or that silently covers a second unrelated edit, defeats the point of a narrow, operator-issued exemption.
- **Do not stamp a marker for a path you (the agent) were just blocked on, on your own initiative.** Surface the block to the operator instead. See THE RULE above.

## When you're done

Report the exempted path and expiry back to the operator in one line. Do not proceed to make the exempted edit yourself unless the operator has separately asked you to — stamping the marker and making the edit are two different actions.
