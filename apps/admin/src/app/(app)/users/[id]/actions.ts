"use server";

import { revalidatePath } from "next/cache";
import { and, countDistinct, eq, ne } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { roles, userRoles, users, userTotp, userTotpRecoveryCodes } from "@/lib/db/schema";
import { isAdminAppRole } from "@/lib/admin-app-roles";
import { FEATURES, hasFeature } from "@repo/permissions";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { grantOrRevokeRole } from "@/lib/role-grant";
import type { ActionResult } from "@/types/actions";

/**
 * setRoleGrantAction — Phase 3 API Contract.
 *
 * **Self-target rule, changed 2026-09-06 (Chris).** This used to refuse ANY
 * self-targeted change as its first statement, before any DB read ("an admin
 * can never modify their own row in this app's matrix, full stop"). It no
 * longer does. An admin may now grant and revoke their own roles, with exactly
 * one exception: the last remaining Admin admin cannot remove their own
 * admin role.
 *
 * The old guard did not prevent privilege escalation — an admin holding
 * ADMIN_USERS can already grant any assignable role to any OTHER account,
 * including one they control, and `grantOrRevokeRole`'s cross-namespace
 * allowlist is what actually bounds which roles are assignable. What it
 * genuinely prevented was self-lockout, which is the narrow case kept below.
 * See docs/work-log/2026-09-06-admin-self-role-editing.md.
 *
 * The exception check runs AFTER the role is resolved from the database, not
 * from the client-supplied id's implied meaning — which branch executes must
 * never be steerable by the caller.
 *
 * `scripts/seed-first-admin.ts` still grants at the DB layer rather than
 * through this action, and still must: it runs with no session at all.
 */
export async function setRoleGrantAction(input: {
  targetUserId: string;
  roleId: string;
  granted: boolean;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_USERS)) {
    return { ok: false, error: "Forbidden." };
  }

  // Self-targeted changes are allowed as of 2026-09-06 (Chris), EXCEPT the one
  // that can strand the organization: the last remaining Admin admin
  // removing their own admin role. See
  // docs/work-log/2026-09-06-admin-self-role-editing.md for why the blanket
  // guard bought less than it looked like — an admin can already grant any
  // assignable role to any OTHER account, so the block prevented convenience,
  // not escalation. What it genuinely prevented was self-lockout, and that is
  // what survives here.
  if (session.user.id === input.targetUserId && !input.granted) {
    // Resolve the role from the DATABASE, never from the client-supplied id's
    // implied meaning — the branch taken must not be steerable by the caller.
    const role = await db.query.roles.findFirst({
      where: eq(roles.id, input.roleId),
      columns: { id: true, name: true },
    });

    if (role && isAdminAppRole(role.name)) {
      // Count OTHER USERS holding it — distinct users, not user_roles rows, so
      // a duplicate binding cannot make the last admin look like two.
      const [{ others } = { others: 0 }] = await db
        .select({ others: countDistinct(userRoles.userId) })
        .from(userRoles)
        .where(
          and(eq(userRoles.roleId, role.id), ne(userRoles.userId, session.user.id)),
        );

      if (others === 0) {
        await recordAudit({
          action: AUDIT_ACTIONS.ADMIN_SELF_TARGET_BLOCKED,
          resourceType: "user",
          resourceId: input.targetUserId,
          metadata: { roleId: input.roleId, roleName: role.name, reason: "last_admin" },
        });
        return {
          ok: false,
          error:
            "You are the only Admin admin. Grant the role to someone else " +
            "before removing your own, or nobody will be able to administer any app.",
        };
      }
    }
  }

  const result = await grantOrRevokeRole({
    targetUserId: input.targetUserId,
    roleId: input.roleId,
    granted: input.granted,
  });
  if (!result.ok) return result;

  revalidatePath(`/users/${input.targetUserId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// resetMfaAction — 2FA atomic-convergence Increment 3 (2026-09-08 —
// apps/portal/docs/work-log/2026-09-08-2fa-atomic-convergence.md Phase 3
// § 3.6; root docs/decisions.md DECISION-022 point 4).
// ---------------------------------------------------------------------------

/**
 * resetMfaAction — admin-mediated MFA reset. Deletes a user's `userTotp`
 * and `userTotpRecoveryCodes` rows so they can re-enroll from scratch,
 * closing this app's own lockout exposure for anyone who lost their
 * authenticator AND every recovery code they were issued (recovery-code
 * acceptance alone — this increment's authorize() change — only helps
 * someone who still holds an unused code).
 *
 * SHAPE, not a route.ts: Phase 3's own design sample ported a predecessor app's
 * `POST /api/users/[id]/reset-mfa` route literally. Diverged here on
 * purpose after reading this app's actual conventions — EVERY existing
 * mutation in this app (this file's own setRoleGrantAction above,
 * users/actions.ts's createUserAction/resendInviteAction/
 * approveRequestAction) is a "use server" Server Action, gated with
 * `hasFeature(session.user.features, FEATURES.ADMIN_USERS)` and
 * `ActionResult`, not a route.ts. This app also has NO `src/app/api/`
 * mutation surface at all today (only NextAuth's own `/api/auth/`), and
 * `src/proxy.ts` unconditionally bypasses everything under `/api/`
 * (`if (pathname.startsWith("/api/")) return NextResponse.next();`) — a new
 * route.ts would sit entirely outside this app's own route gate, relying
 * solely on its own in-handler check. A Server Action posts back to the
 * PAGE's own URL instead, so it inherits the exact same coverage a normal
 * page load gets, on top of the same in-action `auth()`/`hasFeature()`
 * re-check every other mutation here already performs (display-side gating
 * is a convenience, never the authorization boundary — root CLAUDE.md).
 *
 * ATOMICITY, not `db.transaction()`: this app's own `createDb()` call
 * (apps/admin/src/lib/db/index.ts) passes no explicit `{ driver: "pg" }`
 * override, so `scripts/check-driver-capability.mjs`'s own resolution rule
 * applies — against any deployed (non-localhost) target the effective
 * driver is neon-http, which THROWS "No transactions support in neon-http
 * driver" on `.transaction()` (exactly the class of bug that script exists
 * to catch; confirmed by running it against this app after this change —
 * see this increment's work-log). a predecessor app can use `.transaction()` only
 * because it explicitly pins `driver: "pg"` even against its deployed Neon
 * target — Admin does not. `db.batch()` is this monorepo's own documented
 * answer for atomic multi-write without an interactive transaction
 * (DECISION-014, Portal's own established convention) and is safe on BOTH
 * drivers: native on neon-http, and shimmed onto a real Postgres
 * transaction for the `pg` branch (`packages/db/src/client.ts`).
 *
 * SELF-TARGET: ALLOWED, not blocked — a deliberate ruling, not an omission.
 * Unlike setRoleGrantAction's last-admin guard above (which exists because
 * removing your own last admin role can permanently strand the
 * organization), resetting your OWN MFA cannot lock you out: `src/proxy.ts`
 * already forces an immediate, unconditionally-reachable re-enrollment via
 * `/setup-mfa` the moment `hasTotp` goes false, for anyone holding a
 * `admin_*` role — the same gate a never-enrolled new admin hits
 * today. There is no analogous "last remaining X" resource being destroyed.
 * Audited either way (`metadata.selfTarget`), matching DECISION-055 point
 * 3's "audit rather than silently allow" posture for this app generally.
 */
export async function resetMfaAction(input: {
  targetUserId: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_USERS)) {
    return { ok: false, error: "Forbidden." };
  }

  const target = await db.query.users.findFirst({
    where: eq(users.id, input.targetUserId),
    columns: { id: true, email: true },
  });
  if (!target) return { ok: false, error: "User not found." };

  const isSelf = session.user.id === input.targetUserId;

  // Atomic (db.batch(), see this function's own header for why not
  // db.transaction()) — both tables or neither, never a partial reset that
  // deletes the TOTP row but leaves old recovery codes valid (the bug this
  // increment's a predecessor app prerequisite fix also closed there).
  await db.batch([
    db.delete(userTotp).where(eq(userTotp.userId, input.targetUserId)),
    db.delete(userTotpRecoveryCodes).where(eq(userTotpRecoveryCodes.userId, input.targetUserId)),
  ]);

  await recordAudit({
    action: AUDIT_ACTIONS.ADMIN_MFA_RESET,
    resourceType: "user",
    resourceId: target.id,
    metadata: { targetEmail: target.email, selfTarget: isSelf },
  });

  revalidatePath(`/users/${input.targetUserId}`);
  return { ok: true };
}
