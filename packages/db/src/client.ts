import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import * as identitySchema from "./schema";

/**
 * Adapter-selection factory for the shared database. Each app instantiates
 * it from its own `DATABASE_URL` env var:
 *
 *   // apps/<app>/src/lib/db/index.ts
 *   export const db = createDb(process.env.DATABASE_URL);
 *
 * An app whose domain code needs Drizzle's relational query builder
 * (`db.query.<table>.findMany({ with: {...} })`) over its OWN tables passes
 * its own merged schema module instead:
 *
 *   import * as schema from "./schema"; // re-exports @repo/db's tables +
 *                                        // the app's own domain tables +
 *                                        // all relations()
 *   export const db = createDb(process.env.DATABASE_URL, schema);
 *
 * --- Driver selection ---
 *
 * A `localhost`/`127.0.0.1`/`0.0.0.0` hostname selects
 * `drizzle-orm/node-postgres` (a real `pg.Pool` — local Docker Postgres and
 * CI cannot speak neon-http); everything else (every real Neon endpoint)
 * uses `drizzle-orm/neon-http`. `options.driver` forces either path
 * explicitly (used by tests, and as an escape hatch if the heuristic is ever
 * wrong for a future environment).
 */
function resolveDriver(databaseUrl: string): "neon" | "pg" {
  try {
    const { hostname } = new URL(databaseUrl);
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") {
      return "pg";
    }
  } catch {
    // Unparseable URL: fall through to the unconditional neon-http behavior
    // rather than guessing.
  }
  return "neon";
}

export function createDb<
  TSchema extends Record<string, unknown> = typeof identitySchema,
>(
  databaseUrl: string | undefined,
  schema?: TSchema,
  options?: { driver?: "neon" | "pg" },
) {
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your connection string.",
    );
  }
  const resolvedSchema = (schema ?? identitySchema) as TSchema;
  const driver = options?.driver ?? resolveDriver(databaseUrl);

  if (driver === "pg") {
    // TLS for remote hosts only. Local Postgres needs no TLS; hosted
    // Postgres (Neon) refuses non-TLS connections. Decided by hostname
    // rather than trusting an `sslmode=require` query parameter to be
    // present — a missing parameter would surface as a confusing connection
    // error rather than anything obviously TLS-shaped.
    //
    // `rejectUnauthorized: true` is deliberate — hosted providers present a
    // certificate from a public CA, so verification succeeds, and turning it
    // off to "make it work" would silently accept a MITM.
    const isLocal = ((): boolean => {
      try {
        const { hostname } = new URL(databaseUrl);
        return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
      } catch {
        return false;
      }
    })();

    const pool = new Pool({
      connectionString: databaseUrl,
      ...(isLocal ? {} : { ssl: { rejectUnauthorized: true } }),
    });
    // Cast to `Db<TSchema>` (== `NeonHttpDatabase<TSchema>`, see below) even
    // though this is really a `NodePgDatabase<TSchema>` instance. Safe as
    // long as callers on the `pg` branch only use the common `PgDatabase`
    // surface (`.select()/.insert()/.update()/.delete()/.query.*`) — with
    // one exception, `.batch()`, which is shimmed below so call sites cannot
    // tell the drivers apart.
    const pgDb = drizzlePg(pool, { schema: resolvedSchema });

    // `.batch()` does not exist on node-postgres — it is a neon-http method,
    // and `Db<TSchema>` is typed as NeonHttpDatabase, so a `db.batch()` call
    // site typechecks and then throws at runtime against a local database.
    //
    // Sequential execution would NOT be an acceptable shim: neon-http's
    // `.batch()` is atomic and call sites rely on that. So this runs the
    // statements in a real transaction.
    //
    // Each element is a query BUILDER already bound to `pgDb`, so awaiting it
    // directly would execute on the pool and escape the transaction. And
    // collapsing the builder to SQL text via `.getSQL()` discards the
    // builder's `returning`/`fields` metadata, so drizzle's row-mapping step
    // (raw `created_at` → schema field `createdAt`) would never run. The fix:
    // run the builder's own prepare/execute path (which carries `fields`)
    // pointed at the transaction's session instead of the pool session —
    // mirroring what neon-http's own `NeonHttpSession.batch()` does, with a
    // real transaction standing in for neon-http's atomic multi-statement RPC.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pgDb as any).batch = async (queries: readonly any[]) =>
      pgDb.transaction(async (tx) => {
        const results = [];
        for (const query of queries) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const q = query as any;
          const originalSession = q.session;
          q.session = (tx as unknown as { session: unknown }).session;
          let res: unknown;
          try {
            res = await q.execute();
          } finally {
            q.session = originalSession;
          }
          // node-postgres's raw (non-RETURNING) path returns a QueryResult
          // object ({rows, rowCount, ...}); the RETURNING / field-mapped path
          // already returns a plain array of mapped rows. Normalise the
          // former so call sites cannot tell the drivers apart — a mapped
          // array has no `.rows` property to unwrap.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          results.push((res as any)?.rows ?? res);
        }
        return results;
      });

    return pgDb as unknown as Db<TSchema>;
  }

  const sql = neon(databaseUrl);
  return drizzleNeon(sql, { schema: resolvedSchema });
}

// Generic so callers that pass their own merged schema get a `Db` whose
// `db.query.*` covers their full table set, while callers that rely on the
// identity-only default get one scoped to just those tables.
//
// Deliberately `NeonHttpDatabase<TSchema>`, NOT a union with
// `NodePgDatabase<TSchema>` and NOT drizzle's common `PgDatabase` base class:
//   - A plain union breaks overload resolution at real call sites (e.g.
//     `.insert(t).values(v).returning({...})` fails with a spurious
//     "Expected 0 arguments" — a known sharp edge of overloaded methods on
//     TS union types, not a real API incompatibility).
//   - The common base class silently drops `.batch()`/`$withAuth()`, which
//     neon-first app code may legitimately call.
// The `pg`-driver branch of `createDb` casts its return value into this type
// instead — see that branch's own comment for why that's safe.
export type Db<TSchema extends Record<string, unknown> = typeof identitySchema> =
  NeonHttpDatabase<TSchema>;

// The identity-only schema's type, exported so packages/auth's functions
// (createAuth, computeSharedJwtClaims) can default their own TSchema type
// param to it without importing the schema module's runtime value. Those
// functions must stay generic over TSchema — a `Db` bound to
// `typeof identitySchema` rejects an app's wider-schema `Db` at the call
// site (drizzle types `relations` per the exact schema object a `Db` was
// parameterized with, so a schema with `relations()` calls against `users`
// is NOT structurally assignable to one without).
export type IdentitySchema = typeof identitySchema;
