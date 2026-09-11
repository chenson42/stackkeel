/**
 * GET /api/me — identity basics for native clients. Module `mobile`.
 *
 * Accepts EITHER the web session (shell WebView) OR a device bearer token
 * (Expo app). Returns display basics only — no roles, no features, no
 * tokens; authorization decisions stay server-side per Key Invariant 14.
 *
 * SCOPE GUARD: one of the only three bearer-accepting endpoints (with
 * /api/devices/heartbeat and PATCH /api/devices/[id]). See
 * packages/db/src/devices.ts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users, authenticateDeviceToken } from "@repo/db";

export async function GET(req: NextRequest) {
  // Bearer first: the Expo app always sends it; the shell never does.
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const result = await authenticateDeviceToken(db, authHeader);
    if (result.kind === "revoked") {
      return NextResponse.json({ reason: "device_revoked" }, { status: 401 });
    }
    if (result.kind !== "ok") {
      return NextResponse.json({ reason: "unauthorized" }, { status: 401 });
    }
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, result.device.userId))
      .limit(1);
    const user = rows[0];
    if (!user) return NextResponse.json({ reason: "unauthorized" }, { status: 401 });
    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  }

  const session = await auth();
  if (!session?.user?.id || session.user.isActive === false) {
    return NextResponse.json({ reason: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
  });
}
