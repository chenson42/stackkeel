import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

// Daily maintenance GC. Vercel cron invokes via GET — see vercel.json for
// the schedule (0 3 * * *). Prunes expired token rows, 500 per table per
// invocation, from the four platform token tables (all in the `public`
// schema — the shared @repo/db tables):
//   - password_reset_tokens         (short TTL; one row per user max)
//   - email_verification_tokens     (24-h TTL; one row per user max)
//   - user_totp_pending_enrollments (10-min TTL; one row per user max)
//   - invite_tokens                 (multi-day TTL; one row per user max)
// POST is intentionally omitted — no admin "run now" surface exists yet.
//
// Table list per query. Drizzle does not support .limit() on DELETE for
// Postgres; the subquery form is required. RETURNING gives the deleted
// count without a separate SELECT.
export const GC_TABLES = [
  { table: "password_reset_tokens", key: "id" },
  { table: "email_verification_tokens", key: "id" },
  { table: "user_totp_pending_enrollments", key: "user_id" },
  { table: "invite_tokens", key: "id" },
] as const;

export function buildGcQuery(table: string, key: string) {
  return sql`
    DELETE FROM ${sql.raw(`"public"."${table}"`)}
    WHERE ${sql.raw(`"${key}"`)} IN (
      SELECT ${sql.raw(`"${key}"`)} FROM ${sql.raw(`"public"."${table}"`)}
      WHERE "expires_at" < now()
      LIMIT 500
    )
    RETURNING ${sql.raw(`"${key}"`)}
  `;
}

export async function GET(req: Request) {
  // Guard: CRON_SECRET must be set for the worker to run. Without it, ops
  // has no way to authenticate requests — return 503 so the cron dashboard
  // surfaces a visible failure rather than silently no-oping.
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET) {
    return Response.json(
      { error: "Maintenance cron disabled: set CRON_SECRET to enable." },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const results = await Promise.all(
    GC_TABLES.map((t) => db.execute(buildGcQuery(t.table, t.key))),
  );

  const summary = Object.fromEntries(
    GC_TABLES.map((t, i) => [t.table, results[i].rows.length]),
  );

  // Structured log for ops observability (function logs).
  console.log("[cron/maintenance]", JSON.stringify(summary));

  return Response.json({ ok: true, deleted: summary });
}
