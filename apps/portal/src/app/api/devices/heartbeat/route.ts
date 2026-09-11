/**
 * POST /api/devices/heartbeat — bearer-authenticated liveness ping.
 * Bumps last_seen_at (and app_version when reported). Not audited
 * (high-frequency, no privilege change — see AUDIT_ACTIONS comment).
 *
 * SCOPE GUARD: one of the only three bearer-accepting endpoints (with
 * PATCH /api/devices/[id] and /api/me). See packages/db/src/devices.ts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { devices, authenticateDeviceToken } from "@repo/db";

export async function POST(req: NextRequest) {
  const result = await authenticateDeviceToken(db, req.headers.get("authorization"));
  if (result.kind === "revoked") {
    return NextResponse.json({ reason: "device_revoked" }, { status: 401 });
  }
  if (result.kind !== "ok") {
    return NextResponse.json({ reason: "unauthorized" }, { status: 401 });
  }

  let appVersion: string | null = null;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.appVersion === "string") appVersion = body.appVersion.slice(0, 64);
  } catch {
    // Body is optional — a bare POST is a valid heartbeat.
  }

  await db
    .update(devices)
    .set({ lastSeenAt: new Date(), ...(appVersion ? { appVersion } : {}) })
    .where(eq(devices.id, result.device.id));
  return NextResponse.json({ ok: true });
}
