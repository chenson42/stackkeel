"use server";

import { revalidatePath } from "next/cache";
import { setFlag } from "@repo/db";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { FEATURES, hasFeature } from "@repo/permissions";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import type { ActionResult } from "@/types/actions";

/**
 * Toggle one feature flag's `enabled` column (2026-09-05-admin-menu-structure).
 *
 * This is the first write path anywhere in the codebase for the shared
 * `feature_flags` table, and that table already gates live auth behavior
 * platform-wide (`auth.require_2fa`) — a mis-click here is not cosmetic.
 * Scope (`app`) is intentionally NOT settable from this action: this
 * increment ships enable/disable only (Out of scope: "Rollout-percent UI
 * for flags" / no scope editor named in the design's Component plan) — the
 * UI's confirm-step requirement for platform-wide flags is enforced by the
 * caller (flag-row-toggle.tsx) reading the row's existing `app` value, not
 * by this action re-deriving it.
 *
 * Every call is audited via FLAG_UPDATED regardless of scope — the
 * confirm-dialog gate in the UI is a human speed bump for the riskier case,
 * not a signal that the lower-risk case is exempt from the audit trail.
 */
export async function setFlagAction(input: {
  key: string;
  enabled: boolean;
}): Promise<ActionResult<{ enabled: boolean }>> {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_FLAGS)) {
    return { ok: false, error: "Forbidden." };
  }

  const { before, after } = await setFlag(db, input.key, { enabled: input.enabled });

  await recordAudit({
    action: AUDIT_ACTIONS.FLAG_UPDATED,
    resourceType: "feature_flag",
    resourceId: input.key,
    metadata: {
      app: after.app,
      enabledBefore: before?.enabled ?? null,
      enabledAfter: after.enabled,
    },
  });

  revalidatePath("/flags");
  return { ok: true, data: { enabled: after.enabled } };
}
