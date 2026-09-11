import "server-only";
import { recordAuditShared } from "@repo/auth/audit";
// This module is server-only: it calls auth() and headers() from
// next/headers. The `import "server-only"` guard causes the Next.js
// bundler to raise a build-time error if this module is ever imported from
// a Client Component or the Edge runtime (src/proxy.ts) — same guard
// apps/portal/src/lib/audit.ts uses.
import { headers } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";
import { getRequestIp } from "@/lib/request-ip";

// Admin's own audit-event key catalog. Per Chris/Greg's own framing
// ("the single highest-audit-priority surface in this entire initiative")
// and DECISION-055 point 3, this app audits BOTH successful mutations AND
// blocked/rejected mutation attempts (self-target, cross-namespace
// rejection) — a deliberate, named exception to Portal's own
// `deactivateUser` silent-self-block precedent (apps/portal/src/app/(admin)/
// admin/users/actions.ts), scoped to this app only.
export const AUDIT_ACTIONS = {
  // What's-new CRUD (announcements shown to every user).
  WHATS_NEW_ENTRY_CREATED: "admin.whats_new.created",
  WHATS_NEW_ENTRY_UPDATED: "admin.whats_new.updated",
  WHATS_NEW_ENTRY_DELETED: "admin.whats_new.deleted",
  // User creation (createUserAction) + invite delivery.
  ADMIN_USER_CREATED: "admin.user.created",
  ADMIN_INVITE_SENT: "admin.invite.sent",
  // Invite/set-password consumption (consumeInviteTokenAction) — the
  // moment accountStatus flips 'invited' -> 'active' for the invite path.
  ADMIN_INVITE_CONSUMED: "admin.invite.consumed",
  // Role matrix (setRoleGrantAction / approveRequestAction's shared
  // grantRole() helper). One event per (user, role) pair actually changed —
  // never a single batched "roles updated" event (Phase 3 API Contract).
  ADMIN_ROLE_GRANTED: "admin.role.granted",
  ADMIN_ROLE_REVOKED: "admin.role.revoked",
  // Role x feature grid (grantOrRevokeRoleFeature / setRoleFeatureAction,
  // /roles — 2026-09-09-roles-permissions-ux Phase 3 § 5). Edits WHAT a
  // role grants (role_features), not WHO holds it — a distinct pair of
  // keys from ADMIN_ROLE_GRANTED/_REVOKED above, which stay scoped to
  // user_roles. One event per (role, feature) pair actually changed, same
  // .returning()-gated posture as every other grant/revoke pair in this
  // file.
  ADMIN_ROLE_FEATURE_GRANTED: "admin.role_feature.granted",
  ADMIN_ROLE_FEATURE_REVOKED: "admin.role_feature.revoked",
  // Protected-floor rejection (Chris's ruling, 2026-09-09): an attempt to
  // revoke ADMIN_ROLES or ADMIN_USERS from admin itself.
  // Fired even though no DB write happens — same "audit blocked attempts,
  // not just successes" posture as ADMIN_SELF_TARGET_BLOCKED /
  // ADMIN_CROSS_NAMESPACE_REJECTED above (DECISION-055 point 3).
  ADMIN_ROLE_FEATURE_PROTECTED_BLOCKED: "admin.role_feature.protected_blocked",
  // Blocked/rejected mutation ATTEMPTS — DECISION-055 point 3's named
  // exception. Fired even though no DB write happens.
  ADMIN_SELF_TARGET_BLOCKED: "admin.self_target.blocked",
  ADMIN_CROSS_NAMESPACE_REJECTED: "admin.role.namespace_rejected",
  // Account-request queue.
  ADMIN_REQUEST_APPROVED: "admin.request.approved",
  ADMIN_REQUEST_REJECTED: "admin.request.rejected",
  // TOTP enrollment (mandatory, unconditional — DECISION-054 point 4).
  TOTP_ENROLLED: "totp.enrolled",
  // 2FA atomic-convergence Increment 3 (2026-09-08 — apps/portal/docs/
  // work-log/2026-09-08-2fa-atomic-convergence.md Phase 3 §§ 3.2/3.5; root
  // docs/decisions.md DECISION-022 point 4). authorize()'s TOTP branch
  // previously wrote NOTHING on a wrong code — the highest-privilege app in
  // the monorepo logged zero evidence of a failed second-factor attempt.
  // No TOTP_VERIFY_SUCCESS companion key: a routine correct code isn't
  // separately audited any more than a routine correct password is — the
  // eventual session issuance is the meaningful event. TOTP_RECOVERY_SUCCESS
  // IS added despite that same reasoning, because consuming a recovery code
  // is itself the security-relevant event (an irreversible, single-use
  // fallback was just spent) — visibility into that has value even when it
  // was the legitimate account holder using it.
  TOTP_VERIFY_FAILED: "totp.verify_failed",
  TOTP_RECOVERY_SUCCESS: "totp.recovery_succeeded",
  TOTP_RECOVERY_FAILED: "totp.recovery_failed",
  // Admin-mediated MFA reset (POST-equivalent server action, users/[id]/
  // actions.ts's resetMfaAction) — deletes a user's userTotp +
  // userTotpRecoveryCodes rows so they can re-enroll after losing their
  // authenticator and every recovery code. Audited unconditionally,
  // including a self-target reset (metadata.selfTarget) — unlike
  // ADMIN_SELF_TARGET_BLOCKED above, self-targeting this action is
  // ALLOWED (see users/[id]/actions.ts's own comment for why: it cannot
  // strand the caller the way removing your own last admin role can — the
  // proxy's own !hasTotp gate already forces immediate re-enrollment via
  // /setup-mfa, unconditionally reachable), so this key's audit row is a
  // visibility measure, not evidence of a blocked attempt.
  ADMIN_MFA_RESET: "admin.mfa.reset",
  // Self-serve password change (2026-09-05-account-menu-restructure
  // Increment B). This app previously had NO self-serve password flow at
  // all — only invite consumption at /set-password — so a Admin
  // user could never rotate their own password.
  ADMIN_PASSWORD_CHANGED: "admin.password.changed",
  // Zero-admin_*-role authenticated visitor — mirrors Portal's
  // ACCESS_DENIED site (apps/portal/src/app/access-pending/page.tsx),
  // written from this app's own /access-pending page during RSC render.
  ADMIN_ACCESS_DENIED: "admin.access.denied",
  // Rate limiting — infrastructure event written from src/lib/rate-limit.ts,
  // not from an actions.ts file. Mirrors Portal's RATE_LIMIT_BLOCKED
  // precedent (that file's own header explains why the check:audit script
  // never needs to see this call site).
  RATE_LIMIT_BLOCKED: "rate_limit.blocked",
  // Feature-flag mutation (2026-09-05-admin-menu-structure). The flags
  // table already gates live auth behavior platform-wide
  // (`auth.require_2fa`), so every write here is security-relevant — this
  // makes a flag flip traceable in the same cross-app audit viewer this app
  // already ships (apps/admin/src/app/(app)/audit/page.tsx reads this app's
  // own audit_events table alongside a predecessor app's and Portal's).
  FLAG_UPDATED: "admin.flag.updated",
  // Helpdesk operator mutations (module `helpdesk`). Every ticket STATE
  // change is audited — status/assignment/vocabulary edits are the
  // operator-privilege mutations; ordinary thread replies are content
  // authoring and carry an audit-exempt at the call site instead.
  TICKET_STATUS_CHANGED: "ticket.status_changed",
  TICKET_ASSIGNED: "ticket.assigned",
  TICKET_RECLASSIFIED: "ticket.reclassified",
  TICKET_AREA_CHANGED: "ticket.area_changed",
  TICKET_PRIORITY_CHANGED: "ticket.priority_changed",
  FEEDBACK_PROMOTED_TO_TICKET: "feedback.promoted_to_ticket",
  // Branding (module `core`): the brand row drives every page's rendered
  // identity — a defacement vector, so every save is audited.
  BRANDING_UPDATED: "branding.updated",
  // Device auth (module `mobile`, 2026-09-11-phase-4-mobile). Operator
  // revoke of ANY user's device + release-policy edits (the policy can
  // hard-block every native install, so a save is security-relevant).
  DEVICE_REVOKED: "device.revoked",
  APP_RELEASE_POLICY_UPDATED: "app_release.policy_updated",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export type AuditActorOverride = {
  userId: string | null;
  email: string | null;
};

export interface RecordAuditInput {
  action: AuditAction;
  /**
   * Actor resolution — identical contract to apps/portal/src/lib/audit.ts:
   *   undefined (omitted) — call auth() to get the signed-in session.
   *   { userId, email }   — explicit override (unauthenticated flows, or
   *                         call sites where auth() is already resolved).
   *   null                — system write; no actor (bootstrap scripts).
   */
  actor?: AuditActorOverride | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Write a row to this app's own audit_events table. Swallows all failures
 * with console.error so an audit write never takes down the mutation it
 * records — identical contract to apps/portal/src/lib/audit.ts's
 * recordAudit(), duplicated app-local because this app's audit_events table
 * is its own physical table (apps/admin/src/lib/db/schema.ts), not a shared
 * packages/db one — see that schema file's own header comment.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  // Mechanism moved to @repo/auth's recordAuditShared (2026-09-05) — Portal's
  // and Admin's copies were identical apart from this log prefix.
  // The TABLE stays app-local on purpose: per-app audit_events in per-app
  // Postgres schemas (DECISION-007), so write paths stay independent. Only
  // the write path is shared, not the storage.
  await recordAuditShared(input, {
    db,
    auditEvents,
    resolveSession: async () => {
      const session = await auth();
      return { userId: session?.user?.id ?? null, email: session?.user?.email ?? null };
    },
    resolveRequestContext: async () => {
      try {
        const h = await headers();
        return { ip: getRequestIp(h), userAgent: h.get("user-agent") ?? null };
      } catch {
        // No request context (seed scripts, cron) — insert with nulls.
        return { ip: null, userAgent: null };
      }
    },
    logPrefix: "[platform-admin audit]",
  });
}

