import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
// Admin has no version.ts (see the FeedbackForm appVersion prop rationale);
// the workspace package.json version is the honest equivalent.
import pkg from "../../../../package.json";
const APP_VERSION: string = pkg.version;

// Unauthenticated liveness + DB-reachability probe for uptime monitors and
// load balancers. Returns 200 with db:"up" or 503 with db:"down" — never
// anything secret (no connection details, no error messages in the body).
// The DB probe is a 1-row SELECT with a short timeout so a hung pool makes
// this endpoint answer "down" quickly instead of hanging the monitor.
export const dynamic = "force-dynamic";

const DB_PROBE_TIMEOUT_MS = 2500;

export async function GET() {
  let dbState: "up" | "down" = "down";
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db probe timeout")), DB_PROBE_TIMEOUT_MS),
      ),
    ]);
    dbState = "up";
  } catch (err) {
    console.error("[health] db probe failed:", err);
  }

  return Response.json(
    {
      ok: dbState === "up",
      version: APP_VERSION,
      db: dbState,
      time: new Date().toISOString(),
    },
    { status: dbState === "up" ? 200 : 503 },
  );
}
