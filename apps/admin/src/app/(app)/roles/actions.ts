"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { FEATURES, hasFeature } from "@repo/permissions";
import { grantOrRevokeRoleFeature } from "@/lib/role-grant";
import type { ActionResult } from "@/types/actions";

/**
 * setRoleFeatureAction — the /roles page's own Server Action, mirroring
 * users/[id]/actions.ts's setRoleGrantAction split exactly: this file is
 * the authorization boundary (auth() + hasFeature(), first line, re-checked
 * on every call — display-side gating in the UI is a convenience, never
 * the boundary itself), and the actual write/protected-floor/audit/
 * rolesVersion-bump logic lives in the shared internal helper,
 * grantOrRevokeRoleFeature() (apps/admin/src/lib/role-grant.ts).
 *
 * Gated by FEATURES.ADMIN_ROLES, not ADMIN_USERS — Chris's ruling,
 * 2026-09-09-roles-permissions-ux ("2. The page is gated by a new
 * ADMIN_ROLES key"): editing WHAT a role grants is a categorically
 * larger blast radius than assigning an existing role to one user, since
 * the moment a role_features write lands it changes the effective
 * permissions of every user, across every app, who holds that role — with
 * no per-user review step.
 *
 * A route handler was considered and ruled out: apps/admin/src/proxy.ts
 * unconditionally bypasses everything under /api/
 * (`if (pathname.startsWith("/api/")) return NextResponse.next();`,
 * confirmed by reading the file directly), so a route.ts here would sit
 * entirely outside this app's own route gate, relying solely on its own
 * in-handler check — same reasoning users/[id]/actions.ts's own
 * resetMfaAction header gives for choosing a Server Action there. A Server
 * Action posts back to /roles's own URL, inheriting the same coverage a
 * normal page load gets, on top of this file's own re-check.
 *
 * FILE NAME IS LOAD-BEARING: apps/admin/scripts/check-audit-coverage.mjs
 * only inspects files literally named `actions.ts`/`actions.tsx` under
 * src/app/ — confirmed by reading that script directly. This file's own
 * mutation-shaped calls live in grantOrRevokeRoleFeature() (role-grant.ts),
 * not here, so THIS file itself has no db.insert/update/delete to flag —
 * the tripwire's coverage of this feature is therefore really exercised
 * via role-grant.ts already containing both the mutation and
 * recordAudit()/auditEvents calls together, same shape as
 * grantOrRevokeRole/setRoleGrantAction's existing split.
 */
export async function setRoleFeatureAction(input: {
  roleId: string;
  featureKey: string;
  granted: boolean;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_ROLES)) {
    return { ok: false, error: "Forbidden." };
  }

  const result = await grantOrRevokeRoleFeature(input);
  if (!result.ok) return result;

  revalidatePath("/roles");
  return { ok: true };
}
