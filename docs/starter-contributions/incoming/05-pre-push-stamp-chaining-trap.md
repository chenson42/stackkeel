# 05 — Document the `stamp && git push` chaining trap in the pre-push skill

**Origin:** `chenson42/npvitals` root `CLAUDE.md` and session history. Chaining `node scripts/pre-push-gate.mjs --stamp && git push` in one shell command has caught that repo's agent four times, the most recent during the session that produced this contribution — after the trap was already documented there.

**What & why:** Stackkeel implements the identical architecture — a PreToolUse hook inspects the Bash command string and, on detecting `git push`, requires a marker stamped at the current HEAD. Read closely, `commandContainsGitPush()` (~40-70) correctly detects `git push` inside a `&&`-chain: it splits on `/[;&|\n]+/` before tokenizing, so the second segment still matches. **The detection is not the trap — the timing is.** A PreToolUse hook fires *before the Bash tool executes any part of the command string*, including the first half. So a chained `stamp && git push` is intercepted before `--stamp` has run at all, and the hook sees whatever marker existed *before* this command — never the one this same command was about to create. The push is blocked for a reason unrelated to whether the checks ran, and the operator's natural reading ("but I just stamped it") is wrong in a way the error message does not explain. This is a documentation fix, not a code one: the behaviour is correct, and making the hook tolerate chaining would defeat its purpose.

**Applies to the kit as:** a short subsection in `.claude/skills/pre-push/SKILL.md`, adjacent to the existing stamp instructions around lines 164-170.

**Implementation steps:**
1. After the existing stamp command, add: **run the stamp and the push as two separate commands.** A chained `&& git push` is rejected regardless of whether the checks passed.
2. Give the mechanism in one sentence — PreToolUse fires before any part of the command runs, so the hook cannot see a marker the same command has not created yet.
3. Keep it beside the existing *"Committing anything after the stamp invalidates it"* note, and distinguish the two. They look alike and are different: that one is a marker invalidated by a later commit; this one is a marker that does not exist yet. An operator who conflates them re-runs the whole checklist for nothing.

**Verification:** documentation only — no test. The honest check is that someone who has hit the trap reads the new text and recognises what happened to them.

**Classification:** backport-ready · **Risk:** none — prose, no behaviour change.
