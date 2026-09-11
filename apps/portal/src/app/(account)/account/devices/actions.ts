"use server";
import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  devices,
  devicePairingCodes,
  mintPairingCode,
  PAIRING_CODE_TTL_MS,
} from "@repo/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";

/**
 * Self-serve device management (module `mobile`). The authorization boundary
 * is HERE: session + ownership in the WHERE clause. packages/db's helpers are
 * mechanics, not gates.
 */

/** Revoke one of the caller's own devices. Revocation is permanent. */
export async function revokeDevice(deviceId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  const userId = session.user.id;

  const updated = await db
    .update(devices)
    .set({ revokedAt: new Date(), revokedBy: userId })
    .where(and(eq(devices.id, deviceId), eq(devices.userId, userId), isNull(devices.revokedAt)))
    .returning({ id: devices.id });
  if (updated.length === 0) return { ok: false, error: "Device not found." };

  await recordAudit({
    action: AUDIT_ACTIONS.DEVICE_REVOKED,
    actor: { userId, email: session.user.email ?? null },
    resourceType: "device",
    resourceId: deviceId,
    metadata: { via: "account_page" },
  });
  revalidatePath("/account/devices");
  return { ok: true };
}

/**
 * Mint a 6-digit pairing code for the caller. The plaintext code is returned
 * to the UI exactly once (displayed for the user to type into the mobile
 * app); only its hash is stored. Rate-limited: minting is cheap for us but a
 * code is a short-lived credential.
 */
export async function createPairingCode(): Promise<
  ActionResult<{ code: string; expiresAt: string }>
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  const userId = session.user.id;

  const rate = await checkRateLimit(
    `pairing-code-mint:${userId}`,
    { max: 5, windowSeconds: 600 },
    { userId, actor: session.user.email ?? userId, reason: "pairing_code_mint" },
  );
  if (!rate.allowed) {
    return { ok: false, error: "Too many codes requested. Try again in a few minutes." };
  }

  const minted = mintPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
  await db.insert(devicePairingCodes).values({
    userId,
    codeHash: minted.hash,
    expiresAt,
  });

  await recordAudit({
    action: AUDIT_ACTIONS.DEVICE_PAIRING_CODE_CREATED,
    actor: { userId, email: session.user.email ?? null },
    resourceType: "device_pairing_code",
    resourceId: null,
    metadata: { expiresAt: expiresAt.toISOString() },
  });

  return { ok: true, data: { code: minted.raw, expiresAt: expiresAt.toISOString() } };
}
