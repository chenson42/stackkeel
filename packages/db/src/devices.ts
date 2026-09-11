import { and, desc, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { devices, devicePairingCodes, appReleasePolicy } from "./schema/devices";

/**
 * Device-auth business logic — module `mobile`. Same trust posture as
 * tickets.ts/feedback.ts: these helpers are NOT the security boundary — the
 * boundary is each route handler / server action (session or bearer check +
 * ownership), the only callers these should ever have.
 *
 * SCOPE GUARD (mirror of the route-side comment): the device Bearer token is
 * accepted ONLY by POST /api/devices/heartbeat, GET /api/me, and
 * PATCH /api/devices/[id]. Every other handler authenticates via the web
 * session. Do not add Bearer acceptance elsewhere without a decisions.md
 * entry.
 */

// ---------------------------------------------------------------------------
// Pure token helpers (no DB) — unit-testable without a DATABASE_URL
// ---------------------------------------------------------------------------

/**
 * Mint a fresh raw device token and its stored hash. `raw` is returned to the
 * client exactly once; only `hash` is persisted (devices.token_hash).
 */
export function mintDeviceToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashDeviceSecret(raw) };
}

/** SHA-256 hex — the same at-rest posture as password-reset/invite tokens. */
export function hashDeviceSecret(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Constant-time comparison of a raw secret against a stored hash. */
export function verifyDeviceSecretHash(raw: string, storedHash: string): boolean {
  const incoming = Buffer.from(hashDeviceSecret(raw));
  const stored = Buffer.from(storedHash);
  if (incoming.length !== stored.length) return false;
  return timingSafeEqual(incoming, stored);
}

/** Extract the raw token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.trim().split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  const token = parts[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Mint a 6-digit pairing code (crypto-random, leading zeros allowed).
 * Display format "123 456" is the UI's job; the canonical form is 6 digits.
 */
export function mintPairingCode(): { raw: string; hash: string } {
  const raw = randomInt(0, 1_000_000).toString().padStart(6, "0");
  return { raw, hash: hashDeviceSecret(raw) };
}

/** Pairing codes expire 10 minutes after mint. */
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

export const DEVICE_NAME_MAX = 100;
export const DEVICE_PLATFORMS = ["ios", "android"] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export function isDevicePlatform(value: unknown): value is DevicePlatform {
  return value === "ios" || value === "android";
}

// ---------------------------------------------------------------------------
// DB-backed helpers
// ---------------------------------------------------------------------------

export type DeviceRow = typeof devices.$inferSelect;
export type ReleasePolicyRow = typeof appReleasePolicy.$inferSelect;

export type DeviceAuthResult =
  | { kind: "ok"; device: Pick<DeviceRow, "id" | "userId" | "platform" | "name"> }
  | { kind: "unauthorized" }
  | { kind: "revoked" };

/**
 * Authenticate a device bearer token from an Authorization header.
 * Distinguishes `revoked` from plain `unauthorized` so routes can return the
 * `device_revoked` reason the clients key their clear-state behavior on.
 *
 * CROSS-USER INJECTION DEFENSE: userId always derives from this row lookup —
 * never from the request body or URL.
 */
export async function authenticateDeviceToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  authorizationHeader: string | null,
): Promise<DeviceAuthResult> {
  const raw = extractBearerToken(authorizationHeader);
  if (!raw) return { kind: "unauthorized" };
  const hash = hashDeviceSecret(raw);

  const rows = (await db
    .select({
      id: devices.id,
      userId: devices.userId,
      platform: devices.platform,
      name: devices.name,
      tokenHash: devices.tokenHash,
      revokedAt: devices.revokedAt,
    })
    .from(devices)
    .where(eq(devices.tokenHash, hash))
    .limit(1)) as Array<
    Pick<DeviceRow, "id" | "userId" | "platform" | "name" | "tokenHash" | "revokedAt">
  >;
  const row = rows[0];
  if (!row) return { kind: "unauthorized" };
  // Constant-time re-verify: defense in depth behind the indexed lookup.
  if (!verifyDeviceSecretHash(raw, row.tokenHash)) return { kind: "unauthorized" };
  if (row.revokedAt !== null) return { kind: "revoked" };
  return {
    kind: "ok",
    device: { id: row.id, userId: row.userId, platform: row.platform, name: row.name },
  };
}

export type ConsumePairingCodeResult =
  | { kind: "ok"; userId: string }
  | { kind: "invalid_code" };

/**
 * Validate-and-consume a pairing code: unconsumed, unexpired, hash match.
 * Single-use is enforced by the conditional UPDATE on consumed_at IS NULL —
 * two racing exchanges cannot both win.
 */
export async function consumePairingCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  rawCode: string,
  now: Date = new Date(),
): Promise<ConsumePairingCodeResult> {
  if (!/^\d{6}$/.test(rawCode)) return { kind: "invalid_code" };
  const hash = hashDeviceSecret(rawCode);

  const updated = (await db
    .update(devicePairingCodes)
    .set({ consumedAt: now })
    .where(and(eq(devicePairingCodes.codeHash, hash), isNull(devicePairingCodes.consumedAt)))
    .returning({
      userId: devicePairingCodes.userId,
      expiresAt: devicePairingCodes.expiresAt,
    })) as Array<{ userId: string; expiresAt: Date }>;
  const row = updated[0];
  if (!row) return { kind: "invalid_code" };
  // Expiry checked after the consume-write: an expired code is burned either
  // way, and the error surface stays a single `invalid_code` (no oracle for
  // "valid but expired" vs "never existed").
  if (row.expiresAt.getTime() < now.getTime()) return { kind: "invalid_code" };
  return { kind: "ok", userId: row.userId };
}

/** List a user's devices, most recently seen first. Display-safe columns only. */
export async function listUserDevices(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
): Promise<
  Array<
    Pick<
      DeviceRow,
      "id" | "name" | "platform" | "appVersion" | "lastSeenAt" | "revokedAt" | "createdAt"
    >
  >
> {
  return db
    .select({
      id: devices.id,
      name: devices.name,
      platform: devices.platform,
      appVersion: devices.appVersion,
      lastSeenAt: devices.lastSeenAt,
      revokedAt: devices.revokedAt,
      createdAt: devices.createdAt,
    })
    .from(devices)
    .where(eq(devices.userId, userId))
    .orderBy(desc(devices.lastSeenAt), desc(devices.createdAt));
}

/**
 * Read the release policy row (null when never configured). The version-gate
 * consumer treats null and all-null-columns identically: fail open.
 */
export async function getReleasePolicy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<ReleasePolicyRow | null> {
  const rows = (await db
    .select()
    .from(appReleasePolicy)
    .where(eq(appReleasePolicy.id, "default"))
    .limit(1)) as ReleasePolicyRow[];
  return rows[0] ?? null;
}

/** Human-friendly platform label, shared by portal and admin surfaces. */
export function platformLabel(platform: string): string {
  if (platform === "ios") return "iOS";
  if (platform === "android") return "Android";
  return platform;
}
