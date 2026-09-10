# @repo/db

Shared database package: table shapes (Drizzle), the `createDb()` dual-driver
factory, module-organized SQL migrations, and injected helper primitives
(flags, email queue, feedback).

## Migrations

Migrations are **hand-organized SQL files, one per module**, applied in
filename order by `migrations/migrate.mjs` (`pnpm --filter @repo/db db:migrate`).
Applied files are recorded in the `schema_migrations` table by filename and
never re-run.

This is a deliberate departure from `drizzle-kit generate`'s journal format:
the kit's personalization step must be able to **delete a deselected module's
migrations wholesale** (strip = delete that module's files before the first
migrate), and drizzle-kit's `meta/_journal.json` makes hand-removal fragile.
Plain ordered SQL + a tracking table is the simplest thing that survives that.

Conventions, enforced by `scripts/` tripwires at the repo root:

- Every file starts with `-- MODULE: <name>` — the module registry keys
  personalization-time stripping off this header.
- A migration that depends on earlier schema carries `-- VERIFY: <sql>`
  comments; the schema-prerequisites tripwire runs each VERIFY statement
  against the deploy target before applying.
- Migrations are expand-only (never destructive to columns other code still
  reads) so deploys and migrations can run in parallel.

`drizzle.config.ts` remains for `drizzle-kit push` in throwaway local
prototyping only — committed migrations are the source of truth.

## Seeding

`pnpm --filter @repo/db db:seed` bootstraps roles (admin/member), the feature
catalog from `@repo/permissions`, role→feature grants, and an initial admin
user for each address in `INITIAL_ADMIN_EMAILS`. Idempotent — safe to run on
every deploy; one-shot seeds are recorded in `migration_seeds`.
