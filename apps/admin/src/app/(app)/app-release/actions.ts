"use server";

import { revalidatePath } from "next/cache";
import { appReleasePolicy } from "@repo/db";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { FEATURES, hasFeature } from "@repo/permissions";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import type { ActionResult } from "@/types/actions";

/**
 * Upsert the single app_release_policy row (module `mobile`). min_build
 * hard-blocks every native install below it, so a save here can lock users
 * out of the app until they update — audited on every write, and the UI
 * warns before raising min_build.
 */
export async function saveReleasePolicy(input: {
  minBuild: number | null;
  latestBuild: number | null;
  softMessage: string | null;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_DEVICES)) {
    return { ok: false, error: "Forbidden." };
  }

  const minBuild =
    input.minBuild === null || Number.isInteger(input.minBuild) ? input.minBuild : NaN;
  const latestBuild =
    input.latestBuild === null || Number.isInteger(input.latestBuild)
      ? input.latestBuild
      : NaN;
  if (Number.isNaN(minBuild) || Number.isNaN(latestBuild)) {
    return { ok: false, error: "Build numbers must be whole numbers." };
  }
  if (minBuild !== null && latestBuild !== null && minBuild > latestBuild) {
    return { ok: false, error: "Minimum build cannot be greater than latest build." };
  }
  const softMessage = input.softMessage?.trim() ? input.softMessage.trim().slice(0, 500) : null;

  await db
    .insert(appReleasePolicy)
    .values({
      id: "default",
      minBuild,
      latestBuild,
      softMessage,
      updatedAt: new Date(),
      updatedBy: session.user.id ?? null,
    })
    .onConflictDoUpdate({
      target: appReleasePolicy.id,
      set: {
        minBuild,
        latestBuild,
        softMessage,
        updatedAt: new Date(),
        updatedBy: session.user.id ?? null,
      },
    });

  await recordAudit({
    action: AUDIT_ACTIONS.APP_RELEASE_POLICY_UPDATED,
    resourceType: "app_release_policy",
    resourceId: "default",
    metadata: { minBuild, latestBuild, hasSoftMessage: softMessage !== null },
  });
  revalidatePath("/app-release");
  return { ok: true };
}
