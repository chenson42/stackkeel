/**
 * PATCH  /api/devices/[id] — device-bearer-authenticated self-update
 *                            (push token rotation, app version refresh).
 * DELETE /api/devices/[id] — session-authenticated self-serve revoke of the
 *                            user's OWN device (admin revokes go through the
 *                            platform Admin app's audited server action).
 *
 * SCOPE GUARD: PATCH here is one of the only three bearer-accepting
 * endpoints (with /api/devices/heartbeat and /api/me). See
 * packages/db/src/devices.ts.
 *
 * PATCH is deliberately NOT audited (high-frequency, no privilege change —
 * see the AUDIT_ACTIONS comment). DELETE writes DEVICE_REVOKED. The Expo
 * app's "sign out" only discards its local token — true revocation is a
 * web-session action (this endpoint, or the /account/devices server action,
 * both writing the same audit event).
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { devices, authenticateDeviceToken } from "@repo/db";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

const PUSH_TOKEN_MAX = 512;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await authenticateDeviceToken(db, req.headers.get("authorization"));
  if (result.kind === "revoked") {
    return NextResponse.json({ reason: "device_revoked" }, { status: 401 });
  }
  if (result.kind !== "ok" || result.device.id !== id) {
    return NextResponse.json({ reason: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ reason: "invalid_json" }, { status: 400 });
  }

  const patch: Partial<typeof devices.$inferInsert> = { lastSeenAt: new Date() };
  if (typeof body.pushToken === "string" && body.pushToken.length <= PUSH_TOKEN_MAX) {
    patch.pushToken = body.pushToken;
  }
  if (typeof body.appVersion === "string") {
    patch.appVersion = body.appVersion.slice(0, 64);
  }

  await db.update(devices).set(patch).where(eq(devices.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id || session.user.isActive === false) {
    return NextResponse.json({ reason: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Ownership is part of the WHERE — a non-owner's request is a no-op that
  // returns not_found rather than an ownership oracle.
  const updated = await db
    .update(devices)
    .set({ revokedAt: new Date(), revokedBy: userId })
    .where(and(eq(devices.id, id), eq(devices.userId, userId), isNull(devices.revokedAt)))
    .returning({ id: devices.id });
  if (updated.length === 0) {
    return NextResponse.json({ reason: "not_found" }, { status: 404 });
  }

  await recordAudit({
    action: AUDIT_ACTIONS.DEVICE_REVOKED,
    actor: { userId, email: session.user.email ?? null },
    resourceType: "device",
    resourceId: id,
    metadata: { via: "self_serve_api" },
  });
  return NextResponse.json({ ok: true });
}
