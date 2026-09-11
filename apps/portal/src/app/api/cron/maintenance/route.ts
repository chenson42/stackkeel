import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

// DECISION-036 item 5 (Child B — soft-delete): 30-day recovery window before
// a soft-deleted project is purged for real. Exported as a named constant
// (not a bare literal inline in the SQL) so route.test.ts's date-boundary
// test asserts against the exact value this query uses — no risk of the
// test and the code silently drifting apart.
export const PROJECT_PURGE_AFTER_DAYS = 30;

// Extracted to its own function (mirrors buildReminderQuery() in
// task-reminders/route.ts) so it can be unit-tested by compiling the real
// SQL text via PgDialect.sqlToQuery() rather than only exercising it behind
// a mocked db.execute.
export function buildProjectPurgeQuery() {
  return sql`
    DELETE FROM "portal"."projects"
    WHERE id IN (
      SELECT id FROM "portal"."projects"
      WHERE "deleted_at" IS NOT NULL
        AND "deleted_at" < now() - interval '${sql.raw(String(PROJECT_PURGE_AFTER_DAYS))} days'
      LIMIT 500
    )
    RETURNING id
  `;
}

// Vercel cron invokes via GET. See vercel.json for the schedule (0 3 * * *).
// Runs daily at 03:00 UTC to prune expired tokens from three tables:
//   - password_reset_tokens     (60-min TTL; one row per user max)
//   - email_verification_tokens (24-h TTL; one row per user max)
//   - user_totp_pending_enrollments (10-min TTL; one row per user max)
// POST is intentionally omitted — no admin "run now" surface exists yet.
export async function GET(req: Request) {
  // Guard: CRON_SECRET must be set for the worker to run.
  // Without it, ops has no way to authenticate requests — return 503 so the
  // Vercel cron dashboard surfaces a visible failure rather than silently no-oping.
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

  // DELETE expired rows, 500 per table per invocation.
  // Drizzle does not support .limit() on DELETE for Postgres; the subquery
  // form is required. RETURNING gives us the deleted count without a
  // separate SELECT. Untyped sql`` (no generic) is intentional — the type
  // parameter is unnecessary on execute() results.
  const [
    pwdResetResult,
    emailVerifyResult,
    totpPendingResult,
    projectPurgeResult,
  ] = await Promise.all([
    db.execute(sql`
        DELETE FROM "portal"."password_reset_tokens"
        WHERE id IN (
          SELECT id FROM "portal"."password_reset_tokens"
          WHERE "expires_at" < now()
          LIMIT 500
        )
        RETURNING id
      `),
    db.execute(sql`
        DELETE FROM "portal"."email_verification_tokens"
        WHERE id IN (
          SELECT id FROM "portal"."email_verification_tokens"
          WHERE "expires_at" < now()
          LIMIT 500
        )
        RETURNING id
      `),
    // Identity table (shared @repo/db, not Portal's own) — stays explicitly
    // qualified to "public", not left bare, so the ownership boundary is
    // visible in this file's own diff rather than an asymmetric omission a
    // reader has to notice next to the "portal"-qualified lines above.
    db.execute(sql`
        DELETE FROM "public"."user_totp_pending_enrollments"
        WHERE "user_id" IN (
          SELECT "user_id" FROM "public"."user_totp_pending_enrollments"
          WHERE "expires_at" < now()
          LIMIT 500
        )
        RETURNING "user_id"
      `),
    // DECISION-036 item 5 (Child B — soft-delete): the actual hard-delete,
    // delayed 30 days. ON DELETE CASCADE on project_members/project_labels/
    // tasks (and transitively task_labels/checklist_items/task_positions/
    // notifications) fans out from this single statement — confirmed by
    // reading every references() clause in schema.ts pointing at
    // projects.id/tasks.id: all are onDelete: "cascade".
    db.execute(buildProjectPurgeQuery()),
  ]);

  const summary = {
    deletedPwdReset: pwdResetResult.rows.length,
    deletedEmailVerify: emailVerifyResult.rows.length,
    deletedTotpPending: totpPendingResult.rows.length,
    deletedProjects: projectPurgeResult.rows.length,
  };

  // Structured log for ops observability (Vercel Function logs / Datadog).
  console.log("[cron/maintenance]", JSON.stringify(summary));

  return Response.json({ ok: true, ...summary });
}
