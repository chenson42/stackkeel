import { processQueueBatch } from "@/lib/email/queue";

const CRON_SECRET = process.env.CRON_SECRET;

// Vercel cron invokes via GET. See vercel.json for the schedule.
// POST is intentionally omitted — add when an admin "retry now" button is built.
export async function GET(req: Request) {
  // Guard: CRON_SECRET must be set for the worker to run.
  // Without it, ops has no way to authenticate requests — return 503 so the
  // Vercel cron dashboard surfaces a visible failure rather than silently no-oping.
  if (!CRON_SECRET) {
    return Response.json(
      { error: "Email queue worker disabled: set CRON_SECRET to enable." },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = Math.min(
    Math.max(1, parseInt(rawLimit ?? "25", 10) || 25),
    200,
  );

  const result = await processQueueBatch(limit);

  return Response.json({ ok: true, ...result });
}
