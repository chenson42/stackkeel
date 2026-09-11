# 03 — `check-cross-app-table-collision.mjs`: compare physical `schema.table`, not bare names

**Origin:** `chenson42/npvitals` root `scripts/check-cross-app-table-collision.mjs` (325 lines), root `docs/decisions.md` DECISION-005. Portal's and Kindway Admin's own `audit_events` tables were each legitimately within their own app's migration scope, and both would land in the same Postgres `public` schema once the apps shared one physical database — invisible to any check looking at one app's migrations in isolation.

**What & why:** the fix was to give each app its own named Postgres schema (`portal.*`, `admin.*`); this script is the tripwire proving the fix holds. The design detail that matters: it compares the **physical address** `"<schema>.<table>"`, never the bare table name. A naive bare-name check permanently false-positives on `audit_events`, which legitimately appears in more than one app's list *after* the fix — so the obvious implementation is the one that gets disabled within a week for crying wolf. Any monorepo sharing one database with per-app schemas has the same exposure: an app's migration can omit its schema qualifier and silently land in `public`, or in another app's schema. **Stackkeel already has this on its own backlog** — `docs/TODO.md:76` carries the item, `packages/db/src/schema/platform.ts:14-21` describes the collision in the present tense, and `apps/portal/src/lib/db/schema.ts:1-13` says per-app schemas are *"enforced by `scripts/check-cross-app-table-collision.mjs` once present"* — an explicit acknowledgment that it is not.

**Applies to the kit as:** `scripts/check-cross-app-table-collision.mjs`, added to `TRIPWIRES` in `scripts/run-tripwires.mjs`.

**Implementation steps:**
1. Read every app's `drizzle.config.ts` `tablesFilter` plus its declared Postgres schema (`pgSchema(...)` or bare `public`).
2. Build the physical address `"<schema>.<table>"` for every declared table.
3. Fail on any address claimed by two or more apps. Report the apps, the address, and both source files.
4. Print totals on PASS — apps checked, tables declared, unique addresses. A bare "passed" gives the reader no way to notice the script silently scoped to one app, which is how the sibling `cadence-check` bug in the origin repo went unseen for weeks.
5. Exempt shared platform tables explicitly, by an allowlist that names them — not by skipping `public`.

**Verification:** a fixture with two apps declaring `public.audit_events` must fail; the same two declaring `portal.audit_events` and `admin.audit_events` must pass; a shared table declared by two apps must pass only when allowlisted. Revert-proof each.

**Classification:** backport-ready · **Risk:** low — static config analysis, no database connection.
