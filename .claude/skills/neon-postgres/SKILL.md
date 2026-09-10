---
name: neon-postgres
description: Patterns for working with Neon Postgres in this workspace — branching for schema work, pooled vs direct connections, the dual-driver createDb() factory, and the Neon docs as source of truth
---

# Neon Postgres in This Workspace

Both web apps use one shared Postgres — Neon in staging/production (serverless Postgres with autoscaling, branching, instant restore, scale-to-zero), Docker or native Postgres locally. All DB access goes through the shared `createDb()` factory in `packages/db`: a `localhost`/`127.0.0.1`/`0.0.0.0` hostname in `DATABASE_URL` selects `drizzle-orm/node-postgres` (a real `pg.Pool`); any other hostname selects the Neon serverless driver. The `check-driver-capability` tripwire refuses a build whose code calls APIs the selected driver can't run (e.g. `.transaction()` on neon-http).

This skill captures the patterns most relevant to *this* codebase. For broader Neon questions, fall back to the official docs.

## Environment Variables

| Variable | Purpose | Connection shape |
|----------|---------|------------------|
| `DATABASE_URL` | Runtime app connection for both apps. | On Vercel: pooled Neon host (`-pooler`). Locally: local Postgres. |
| `DIRECT_DATABASE_URL` | Drizzle Kit, migrations, scripts. | Direct (no `-pooler` suffix). |

Migration tools need a direct connection because they run DDL and inspect the schema; the app at runtime uses the pooled connection because serverless functions burst.

## Migration Commands (run from the repo root)

```bash
pnpm db:generate   # Diff packages/db/src/schema/ against packages/db/migrations/ and write a new migration. File-based only, never dials a DB.
pnpm db:migrate    # Apply committed migrations in order (tracked in drizzle.__drizzle_migrations)
pnpm db:push       # Apply the live diff directly — early iteration on a disposable branch only. Interactive terminal only (see below).
pnpm db:seed       # Seed roles, features, bindings, off-by-default flags. Idempotent.
```

The schema files are the source of truth; `packages/db/migrations/` is what gets replayed. Every migration carries a `-- MODULE: <name>` header (personalization strips by module) and a `-- VERIFY: <sql>` predicate (the schema-prerequisite gate runs it against the deploy target).

**`db:push` hard-refuses outside a real TTY** — `drizzle-kit push`'s destructive-statement confirmation has been directly observed to silently auto-apply (no prompt, no error) when stdin/stdout isn't a terminal. Never pipe, script, or run it from a non-interactive agent shell. DB-touching commands also refuse a non-local `DATABASE_URL` unless explicitly overridden — schema mistakes belong on disposable branches, not shared environments.

## Branching Pattern for Schema Work

Neon's killer feature is **branches** — instant, copy-on-write clones of your database with their own compute endpoint. Use them for any non-trivial schema change you want to test against production-shaped data:

1. **Create a Neon branch** off `main` (Neon console, or `neonctl branches create --name feature/<name>`).
2. **Grab the branch's connection strings** (pooled + direct).
3. **Point `.env.local`** at the branch (`DATABASE_URL` + `DIRECT_DATABASE_URL`).
4. **Iterate**: `pnpm db:push` repeatedly while shaping the schema (interactive terminal only), then `pnpm db:seed` to confirm the seed still applies.
5. **When the schema is right, commit a migration**: `pnpm db:generate`, add the `-- MODULE:` header and `-- VERIFY:` predicate, review, commit.
6. **Apply to production** via the db-sync workflow after merge (expand-only migrations).
7. **Delete the branch** when the feature ships.

The point is that schema mistakes never touch production data. CI's e2e workflow uses the same mechanism — an ephemeral branch created and deleted per run.

## Pooled vs Direct Connections

Use the pooled host (`-pooler` suffix) for app code — Neon's PgBouncer multiplexes connections so a bursty serverless workload doesn't exhaust the Postgres connection limit. Use the direct host for migrations.

The Edge runtime cannot import `@repo/db` regardless of which host is configured — it pulls in a Postgres driver. Each app's `src/proxy.ts` runs on Edge and must never import it; the `server-only` guard turns that mistake into a build failure rather than a runtime one.

## Scale-to-Zero and Cold Starts

By default, Neon's compute suspends after a few minutes of inactivity and resumes on the next query. The first query after suspend has a noticeable cold-start penalty (hundreds of milliseconds). Storage stays active, so data is never paged out.

## Useful Patterns

### Querying

```typescript
import { db } from "@repo/db";
import { users } from "@repo/db/schema";
import { eq } from "drizzle-orm";
const row = await db.query.users.findFirst({ where: eq(users.email, email) });
```

### Raw SQL escape hatch

`db.execute(sql\`SELECT count(*) FROM audit_events\`)` via `drizzle-orm`'s `sql` tag. Use sparingly — almost everything is expressible through the query builder — and never `sql<Date>` (the `check:sql-date` tripwire bans it: the Neon serverless driver returns computed-expression timestamps as strings at runtime, so the type lies).

**Two traps that have both cost real time:**

- **Alias every computed column.** `SELECT to_regclass(a) IS NOT NULL, to_regclass(b) IS NOT NULL` returns two columns BOTH named `?column?`; node-postgres keys each row by column name, so they collapse into one and the second value is lost.
- **Never round-trip a timestamp through JavaScript for a keyset cursor.** Postgres stores `timestamptz` at microsecond precision; a JS `Date` holds milliseconds, so a row at `.123456` is neither `< .123` nor `= .123` and vanishes from later pages. Compare row values inside Postgres instead.

## Neon Documentation

The Neon docs are the source of truth for platform behavior. Always verify against the docs before relying on a feature claim — Neon evolves.

- **Docs index:** https://neon.com/docs/llms.txt
- **Branching:** https://neon.com/docs/introduction/branching
- **Connection pooling:** https://neon.com/docs/connect/connection-pooling
- **Scale to zero:** https://neon.com/docs/introduction/scale-to-zero
- **Instant restore:** https://neon.com/docs/introduction/branch-restore
- **Drizzle + Neon:** https://neon.com/docs/guides/drizzle
- **Neon CLI (`neonctl`):** https://neon.com/docs/reference/neon-cli

Any Neon doc page is available as Markdown by appending `.md` to the URL.
