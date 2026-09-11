/**
 * POST /api/devices — device registration. Module `mobile`.
 *
 * Two auth paths, one endpoint:
 *   1. Session cookie (the Capacitor shell's WebView shares the web session)
 *      — the signed-in user registers their own device.
 *   2. `pairingCode` in the body (the Expo app, which never has a web
 *      session) — a 6-digit single-use code the user minted at
 *      /account/devices while signed in on the web. Rate-limited by IP.
 *
 * Either way the response carries the raw bearer token EXACTLY ONCE plus the
 * current version policy. The server stores only the SHA-256 hash.
 *
 * SCOPE GUARD: this endpoint ISSUES bearer tokens; it never accepts one.
 * Bearer auth is accepted only by /api/devices/heartbeat, /api/me, and
 * PATCH /api/devices/[id] (see packages/db/src/devices.ts).
 *
 * AUDIT NOTE: DEVICE_REGISTERED is written here, in a route handler — the
 * check:audit tripwire scans only actions.ts files and will not see it.
 * Intentional; follows the documented RATE_LIMIT_BLOCKED precedent
 * (src/lib/audit.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  devices,
  mintDeviceToken,
  consumePairingCode,
  getReleasePolicy,
  isDevicePlatform,
  DEVICE_NAME_MAX,
} from "@repo/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ reason: "invalid_json" }, { status: 400 });
  }

  const platform = body.platform;
  if (!isDevicePlatform(platform)) {
    return NextResponse.json({ reason: "invalid_platform" }, { status: 400 });
  }
  const name =
    typeof body.name === "string" && body.name.trim().length > 0
      ? body.name.trim().slice(0, DEVICE_NAME_MAX)
      : null;
  const appVersion =
    typeof body.appVersion === "string" ? body.appVersion.slice(0, 64) : null;

  // Resolve the owning user via one of the two auth paths.
  let userId: string | null = null;
  const pairingCode = typeof body.pairingCode === "string" ? body.pairingCode.trim() : null;

  if (pairingCode) {
    // Pairing-code path (Expo app). IP-keyed rate limit BEFORE the consume
    // attempt — 6-digit codes are guessable at volume.
    const ip = getRequestIp(req.headers) ?? "unknown";
    const rate = await checkRateLimit(
      `device-pair:${ip}`,
      { max: 10, windowSeconds: 900 },
      { userId: null, actor: ip, reason: "device_pairing" },
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { reason: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 900) } },
      );
    }
    const consumed = await consumePairingCode(db, pairingCode);
    if (consumed.kind !== "ok") {
      return NextResponse.json({ reason: "invalid_code" }, { status: 401 });
    }
    userId = consumed.userId;
  } else {
    // Session path (shell WebView).
    const session = await auth();
    if (!session?.user?.id || session.user.isActive === false) {
      return NextResponse.json({ reason: "unauthorized" }, { status: 401 });
    }
    userId = session.user.id;
    const rate = await checkRateLimit(
      `device-register:${userId}`,
      { max: 10, windowSeconds: 3600 },
      { userId, actor: session.user.email ?? userId, reason: "device_register" },
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { reason: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 3600) } },
      );
    }
  }

  const minted = mintDeviceToken();
  const inserted = await db
    .insert(devices)
    .values({
      userId,
      name,
      platform,
      appVersion,
      tokenHash: minted.hash,
      lastSeenAt: new Date(),
    })
    .returning({ id: devices.id });
  const deviceId = inserted[0]!.id;

  await recordAudit({
    action: AUDIT_ACTIONS.DEVICE_REGISTERED,
    actor: { userId, email: null },
    resourceType: "device",
    resourceId: deviceId,
    metadata: { platform, via: pairingCode ? "pairing_code" : "session" },
  });

  const policy = await getReleasePolicy(db);
  return NextResponse.json(
    {
      deviceId,
      token: minted.raw,
      versionPolicy: {
        minBuild: policy?.minBuild ?? null,
        latestBuild: policy?.latestBuild ?? null,
        softMessage: policy?.softMessage ?? null,
      },
    },
    { status: 201 },
  );
}
