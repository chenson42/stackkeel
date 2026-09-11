"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { devices } from "@repo/db";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { FEATURES, hasFeature } from "@repo/permissions";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import type { ActionResult } from "@/types/actions";

/**
 * Operator revoke of ANY user's device (module `mobile`). The self-serve
 * path (a user revoking their own device) lives in Portal; this is the
 * admin override for lost/stolen devices and offboarding. Revocation is
 * permanent — the device's next authenticated call gets `device_revoked`
 * and clears its local state.
 */
export async function revokeDeviceAsOperator(deviceId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_DEVICES)) {
    return { ok: false, error: "Forbidden." };
  }

  const updated = await db
    .update(devices)
    .set({ revokedAt: new Date(), revokedBy: session.user.id ?? null })
    .where(and(eq(devices.id, deviceId), isNull(devices.revokedAt)))
    .returning({ id: devices.id, userId: devices.userId });
  if (updated.length === 0) return { ok: false, error: "Device not found or already revoked." };

  await recordAudit({
    action: AUDIT_ACTIONS.DEVICE_REVOKED,
    resourceType: "device",
    resourceId: deviceId,
    metadata: { ownerUserId: updated[0]!.userId, via: "admin" },
  });
  revalidatePath("/devices");
  return { ok: true };
}
