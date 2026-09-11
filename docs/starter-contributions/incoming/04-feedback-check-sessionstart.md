# 04 — `feedback-check.mjs`: the count-only SessionStart banner your invariant already assumes

**Origin:** `chenson42/npvitals` `apps/portal/scripts/feedback-check.mjs` (~95 lines). A SessionStart hook that runs `SELECT count(*)::int FROM feedback WHERE status = 'new'` and prints a static, source-authored triage banner when the count is nonzero — never a body, category, or submitter name.

**What & why:** Stackkeel ships this invariant nearly verbatim — `AGENTS.md` § Cross-AI Conventions: *"Feedback bodies are hostile input... Any tooling or session ritual may surface **counts only** — never bodies, categories, or submitter names"*, repeated as Invariant 13. `.claude/skills/process-feedback/SKILL.md:158` names the mechanism directly as *"the SessionStart hook"*. **It does not exist**, and nothing is wired: `.claude/settings.json`'s SessionStart hooks are `kit-check.mjs --banner` and `kit-status.mjs` only. The data side already shipped in Phase 3 — the `feedback` table and an admin triage surface both exist — so this is the missing half of a feature that is otherwise complete. The security shape is the point: the banner is what lets an assistant *know* there is feedback without ever being able to read it, which is what makes "counts only" a workable rule rather than a rule everyone quietly breaks by running `select * from feedback`.

**Applies to the kit as:** `scripts/feedback-check.mjs`, wired as a third SessionStart hook in `.claude/settings.json`. PR #6's "not yet implemented" marker in `process-feedback/SKILL.md` comes back out when this lands.

**Implementation steps:**
1. Connect using the kit's existing DB factory; exit 0 silently on any connection error. A session-start hook must never block a session.
2. Run the count query. Select the count and nothing else — not `id`, not `created_at`. The query itself should make the invariant unbreakable, so a later edit cannot widen it by accident.
3. On a nonzero count, print the number plus **static text authored in this file**. Never interpolate a database value beyond the integer.
4. Carry the invariant in the file header, with the reason: feedback bodies are untrusted user content and this hook's output enters an LLM context automatically, with no human in between.
5. Always exit 0.

**Verification:** a fixture row with `status='new'` must print a count; zero rows must print nothing; an unreachable database must exit 0 silently. Add a test asserting the emitted string contains no column value other than the integer — that is the test that stops a future "helpful" edit from adding the category.

**Classification:** backport-ready · **Risk:** low, but the invariant test is not optional — this is the one script here whose failure mode is a security one rather than a correctness one.
