# 02 — `check-driver-capability.mjs`: refuse a build calling an API its selected driver can't run

**Origin:** `chenson42/npvitals` root `scripts/check-driver-capability.mjs` (163 lines). Sixteen write paths called `db.transaction()`, but `createDb()`'s hostname heuristic selects Drizzle's `neon-http` driver for every non-localhost target, and `neon-http` throws `"No transactions support in neon-http driver"` by design. Local dev never reproduced it — `createDb()` picks `pg` locally, where `.transaction()` works fine.

**What & why:** the two drivers behind one `createDb()` do not support an identical API surface, and nothing before runtime says which lines only work on one of them. The failure is invisible on a developer machine by construction, which is what makes it worth a tripwire rather than a code review. **Stackkeel already solved the narrower case better than this repo did** — `packages/db/src/client.ts` (~95-135) shims `.batch()` onto `pg` by running a real transaction underneath, so `.batch()` code works on both drivers. That shim is recommended back to this repo as an upstream candidate. But the *class* of bug is wider than one method, and Stackkeel's own source already assumes this script exists: `apps/admin/src/app/(app)/users/[id]/actions.ts:134-142` reasons explicitly through *"this app's own `createDb()` call passes no explicit `{ driver: 'pg' }` override, so `scripts/check-driver-capability.mjs`'s own resolution rule applies"*. That comment is currently reasoning about a file that isn't there.

**Applies to the kit as:** `scripts/check-driver-capability.mjs`, added to `TRIPWIRES` in `scripts/run-tripwires.mjs`.

**Implementation steps:**
1. For each app, resolve the effective driver the same way `createDb()` does — read the explicit `{ driver }` option if passed, else apply the hostname heuristic to that app's `DATABASE_URL`. **Resolve it, do not assume it**; the whole bug class comes from the resolution being implicit.
2. Maintain a small table of Drizzle APIs unsupported per driver. `.transaction()` on `neon-http` is the known entry; keep the table data-driven so adding one is a one-line change.
3. Scan each app's source for those call sites and fail when a call is unsupported on that app's resolved driver.
4. Print the resolution for every app in the PASS output, not just failures. A silent pass invites the reader to assume the wrong driver was checked.

**Verification:** a fixture app pinned to `neon-http` calling `.transaction()` must fail; the same app with `{ driver: 'pg' }` must pass; an app with no `DATABASE_URL` must not crash. Revert-proof each.

**Classification:** backport-ready · **Risk:** low — read-only static analysis; the only cost of a wrong answer is a false failure, which the printed resolution table makes immediately diagnosable.
