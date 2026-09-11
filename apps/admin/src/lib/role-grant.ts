import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { roles, userRoles, features, roleFeatures } from "@/lib/db/schema";
import { FEATURES, isKnownRoleName } from "@repo/permissions";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { bumpRolesVersionForRole } from "@/lib/roles-version";

/**
 * grantOrRevokeRole — the ONE internal helper both setRoleGrantAction
 * (apps/admin/src/app/users/[id]/actions.ts) and approveRequestAction
 * (apps/admin/src/app/requests/actions.ts) call, per Phase 3's own
 * instruction ("not a copy — both call a shared internal grantRole()
 * helper"). Centralizing this here means the fail-closed cross-namespace
 * check (DECISION-054/055 point 6) and the per-(user,role) audit event
 * (DECISION-055 point 3's "one event per role actually changed") can never
 * drift between the two call sites.
 *
 * Does NOT include the self-target guard — that check is `actingAdmin.id
 * === targetUserId`, which only setRoleGrantAction's caller (an admin
 * editing another person's matrix) can even trigger; approveRequestAction
 * targets a brand-new-or-existing REQUESTER, never the acting admin's own
 * row, by construction. Self-target stays inline at each call site's own
 * top, before this helper is ever reached (Phase 3 API Contract: "first
 * line of the function body, before any DB read").
 *
 * Re-derives the role's real `name` from a fresh DB lookup by `roleId`
 * (never trusts a client-posted name) — the load-bearing check from the
 * precedent bug fix (2026-09-02-admin-users-privilege-escalation.md),
 * widened here to the cross-namespace UNION allowlist
 * (isKnownRoleName, promoted to @repo/permissions per DECISION-059 ruling 3 —
 * this app's own hand-duplicated apps/admin/src/lib/role-namespaces.ts was
 * retired in favor of it) rather than a single app's narrow reject-list, per
 * DECISION-054/055 point 6.
 */
export async function grantOrRevokeRole(input: {
  targetUserId: string;
  roleId: string;
  granted: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await db.query.roles.findFirst({ where: eq(roles.id, input.roleId) });

  if (!role || !isKnownRoleName(role.name)) {
    await recordAudit({
      action: AUDIT_ACTIONS.ADMIN_CROSS_NAMESPACE_REJECTED,
      resourceType: "user",
      resourceId: input.targetUserId,
      metadata: { roleId: input.roleId, roleName: role?.name ?? null },
    });
    return { ok: false, error: "That role cannot be assigned from Admin." };
  }

  // Both branches gate their audit event on a row having ACTUALLY changed,
  // via `.returning()` — Postgres returns rows only for a statement that did
  // something, so this is a direct read of "did it happen" rather than an
  // inference. Before 2026-09-07 both events were written unconditionally,
  // which meant re-saving the role matrix unchanged, or approving a request
  // for someone who already held the role, fabricated a ADMIN_ROLE_GRANTED
  // event — indistinguishable in the audit log from a real privilege change,
  // in the app that IS the cross-app access-control record. Same defect in
  // the revoke direction for a role the user never held.
  //
  // A no-op returns { ok: true } deliberately. The caller submits a desired
  // end state (the role matrix posts every row, not just the changed ones),
  // and that end state holds — an error here would break the matrix for no
  // benefit. "Nothing to do" is success; it is just not an audit event.
  if (input.granted) {
    // Ruling 2 binding item 2 (already shipped, unrelated to this fix — see
    // 2026-09-07-role-grant-false-audit-events.md): explicit conflict
    // target, never a bare onConflictDoNothing(), plus a returning()-gated
    // audit event. The persona trigger's RAISE EXCEPTION is NOT
    // interceptable by ON CONFLICT (it fires BEFORE INSERT, before Postgres
    // ever reaches conflict arbitration) — this try/catch exists only for
    // the race window between the pre-check read above and this write.
    let inserted: { id: string }[];
    try {
      inserted = await db
        .insert(userRoles)
        .values({ userId: input.targetUserId, roleId: role.id })
        // Conflict target named explicitly rather than left bare: `userRoles`
        // has a uuid PK *and* the unique (user_id, role_id) index this cares
        // about (packages/db/src/schema/identity.ts:169). A bare DO NOTHING
        // would also swallow a future constraint's violation silently.
        .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] })
        .returning({ id: userRoles.id });
    } catch {
      return {
        ok: false,
        error: "That role conflicts with a persona role this user already holds.",
      };
    }

    if (inserted.length === 0) return { ok: true }; // already held — nothing changed

    await recordAudit({
      action: AUDIT_ACTIONS.ADMIN_ROLE_GRANTED,
      resourceType: "user",
      resourceId: input.targetUserId,
      metadata: { roleId: role.id, roleName: role.name },
    });
  } else {
    const deleted = await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, input.targetUserId), eq(userRoles.roleId, role.id)))
      .returning({ id: userRoles.id });

    if (deleted.length === 0) return { ok: true }; // did not hold it — nothing changed

    await recordAudit({
      action: AUDIT_ACTIONS.ADMIN_ROLE_REVOKED,
      resourceType: "user",
      resourceId: input.targetUserId,
      metadata: { roleId: role.id, roleName: role.name },
    });
  }

  return { ok: true };
}

/**
 * grantOrRevokeRoleFeature — the write path for the new /roles page (a
 * role x feature grid, editing WHAT a role grants — role_features — as
 * opposed to grantOrRevokeRole above, which edits WHO holds a role —
 * user_roles). Origin: 2026-09-09-roles-permissions-ux Phase 3 § 2/§ 3.
 *
 * Mirrors grantOrRevokeRole's shape exactly, per that same discipline:
 *   - Re-derives BOTH the role and the feature from the database by their
 *     posted ids — never trusts a client-posted id's implied meaning.
 *   - Explicit conflict target on the insert (`[roleFeatures.roleId,
 *     roleFeatures.featureKey]`), never a bare onConflictDoNothing() —
 *     same "a future constraint's violation must not be silently
 *     swallowed" reasoning as grantOrRevokeRole's own comment.
 *   - `.returning()`-gated audit event: a no-op re-toggle (already
 *     granted, or already not granted) returns `{ ok: true }` without
 *     writing an audit row or bumping rolesVersion — "nothing to do" is
 *     success, but it is not an event (same posture as grantOrRevokeRole,
 *     which cites 2026-09-07-role-grant-false-audit-events.md for why this
 *     matters in THIS app's audit log specifically).
 *
 * Does NOT check auth() / FEATURES.ADMIN_ROLES itself — same split as
 * grantOrRevokeRole/setRoleGrantAction: the "use server" action
 * (setRoleFeatureAction, apps/admin/src/app/(app)/roles/actions.ts) is the
 * authorization boundary and re-checks the session on every call: display-
 * side gating (a disabled cell) is a convenience, never the boundary
 * itself.
 *
 * PROTECTED FLOOR (Chris's ruling, 2026-09-09 — Phase 3 § 3): {ADMIN_ROLES,
 * ADMIN_USERS} can never be revoked from the role literally named
 * "admin". ADMIN is single-tier (no read-only/auditor
 * tier — CLAUDE.md's own Admin § Roles) and this app has no
 * self-serve recovery path: an admin who removes ADMIN_ROLES from their
 * own role cannot re-grant it to themselves without direct database
 * access, and removing ADMIN_USERS removes the only other path back
 * (granting the role to a second person via /users). Checked here —
 * server-side, before any write — not only as a disabled checkbox in the
 * UI, so a direct call to setRoleFeatureAction bypassing the UI hits the
 * identical wall. Revoke-only: granting is never blocked by this check.
 *
 * bumpRolesVersionForRole (apps/admin/src/lib/roles-version.ts) runs after
 * every row-changing write, gated on a row having actually changed
 * (matching the audit gating above) — role_features has no DB trigger
 * analogous to 0004_roles_version_trigger.sql's user_roles trigger, so
 * without this call a toggle here has ZERO effect on any already-signed-in
 * holder of the affected role until they sign out and back in. See
 * roles-version.ts's own header for the full mechanism.
 */
export async function grantOrRevokeRoleFeature(input: {
  roleId: string;
  featureKey: string;
  granted: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await db.query.roles.findFirst({ where: eq(roles.id, input.roleId) });
  if (!role) {
    return { ok: false, error: "Role not found." };
  }

  const feature = await db.query.features.findFirst({
    where: eq(features.key, input.featureKey),
  });
  if (!feature) {
    return { ok: false, error: "Feature not found." };
  }

  const PROTECTED_FLOOR = new Set<string>([FEATURES.ADMIN_ROLES, FEATURES.ADMIN_USERS]);

  if (role.name === "admin" && !input.granted && PROTECTED_FLOOR.has(feature.key)) {
    await recordAudit({
      action: AUDIT_ACTIONS.ADMIN_ROLE_FEATURE_PROTECTED_BLOCKED,
      resourceType: "role",
      resourceId: role.id,
      metadata: { featureKey: feature.key, roleName: role.name },
    });
    return {
      ok: false,
      error: `${feature.key} cannot be removed from Admin's own admin role — it would lock out every admin.`,
    };
  }

  if (input.granted) {
    const inserted = await db
      .insert(roleFeatures)
      .values({ roleId: role.id, featureKey: feature.key })
      // Explicit conflict target — see this function's own header for why
      // a bare onConflictDoNothing() is the wrong shape here, same
      // reasoning as grantOrRevokeRole's own insert above.
      .onConflictDoNothing({ target: [roleFeatures.roleId, roleFeatures.featureKey] })
      .returning({ id: roleFeatures.id });

    if (inserted.length === 0) return { ok: true }; // already granted — nothing changed

    await bumpRolesVersionForRole(db, role.id);
    await recordAudit({
      action: AUDIT_ACTIONS.ADMIN_ROLE_FEATURE_GRANTED,
      resourceType: "role",
      resourceId: role.id,
      metadata: { featureKey: feature.key, roleName: role.name },
    });
  } else {
    const deleted = await db
      .delete(roleFeatures)
      .where(and(eq(roleFeatures.roleId, role.id), eq(roleFeatures.featureKey, feature.key)))
      .returning({ id: roleFeatures.id });

    if (deleted.length === 0) return { ok: true }; // already not granted — nothing changed

    await bumpRolesVersionForRole(db, role.id);
    await recordAudit({
      action: AUDIT_ACTIONS.ADMIN_ROLE_FEATURE_REVOKED,
      resourceType: "role",
      resourceId: role.id,
      metadata: { featureKey: feature.key, roleName: role.name },
    });
  }

  return { ok: true };
}
