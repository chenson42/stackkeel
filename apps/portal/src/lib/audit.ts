import "server-only";
import { recordAuditShared } from "@repo/auth/audit";
// This module is server-only: it calls auth() and headers() from next/headers.
// The `import "server-only"` guard above causes the Next.js bundler to raise
// a build-time error if this module is ever imported from a Client Component
// or the Edge runtime (src/proxy.ts).
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";
import { getRequestIp } from "@/lib/request-ip";
// `@/auth` is deliberately NOT a static import here (task-auth-onto-roles,
// DECISION-017, Increment 2 rework, 2026-09-09 — root-caused in this
// work-log's Phase 5 FAIL, Finding 1). `@/auth` calls NextAuth v5's
// `createAuth(config)` factory at module scope, which unconditionally
// generates `signIn`/`signOut` server-action wrappers that import `redirect`
// from `next/navigation` — a client module requiring `React.createContext()`.
// Under Next's own bundler that's fine (its intended runtime); under a plain
// `tsx` script invocation it crashes on import alone, before any code in
// this file — or in any of ITS callers — ever runs, regardless of whether
// that caller ever needed the signed-in session. A one-time backfill script
// that always passes `actor: null` or an explicit `{ userId, email }`
// (see `resolveSession` below) never needed `@/auth` loaded at all; the
// static import forced the cost on it anyway. Deferring to a dynamic
// `import()`, evaluated only inside `resolveSession` and only actually
// invoked by `recordAuditShared` when `input.actor === undefined`, makes
// this module's own doc comment ("safe to call from seed scripts and cron
// jobs") true at the import level, not just inside the function body. No
// behavior change for real request-context callers — `@/auth` is already
// loaded elsewhere in every real request, so the dynamic import resolves
// from the module cache.

export const AUDIT_ACTIONS = {
  // Existing — string values are frozen; they match live audit_events rows.
  FEATURE_FLAG_TOGGLED: "feature_flag.toggled",
  TOTP_ENROLLED: "totp.enrolled",
  TOTP_RECOVERY_CODES_REGENERATED: "totp.recovery_codes.regenerated",
  TOTP_RESET: "totp.reset",
  USER_ROLE_ASSIGNED: "user.role.assigned",
  USER_ROLE_REMOVED: "user.role.removed",
  USER_2FA_REQUIRED_CHANGED: "user.2fa_required.changed",
  USER_2FA_FORCE_RESET: "user.2fa_force_reset",
  // Account self-serve actions
  USER_PROFILE_UPDATED: "user.profile_updated",
  USER_EMAIL_CHANGE_REQUESTED: "user.email_change_requested",
  USER_EMAIL_CHANGED: "user.email_changed",
  USER_EMAIL_CHANGE_CANCELLED: "user.email_change_cancelled",
  USER_PASSWORD_CHANGED: "user.password_changed",
  USER_DELETION_REQUESTED: "user.deletion_requested",
  // Password-reset flow (unauthenticated; no current-password proof required)
  USER_PASSWORD_RESET_REQUESTED: "user.password_reset_requested",
  USER_PASSWORD_RESET_COMPLETED: "user.password_reset_completed",
  // Helpdesk (module `helpdesk`) — filing is audited (it fans out email to
  // every operator); ordinary thread replies are not (audit-exempt at the
  // call site).
  // kit-module:helpdesk-begin
  TICKET_FILED: "ticket.filed",
  // kit-module:helpdesk-end
  // TOTP verification attempts (written from src/app/(auth)/totp/actions.ts)
  TOTP_VERIFY_FAILED: "totp.verify_failed",
  TOTP_VERIFY_SUCCEEDED: "totp.verify_succeeded",
  TOTP_RECOVERY_FAILED: "totp.recovery_failed",
  TOTP_RECOVERY_SUCCEEDED: "totp.recovery_succeeded",
  // Admin user management
  USER_DEACTIVATED: "user.deactivated",
  USER_REACTIVATED: "user.reactivated",
  // Rate limiting — infrastructure event written from src/lib/rate-limit.ts.
  // The check:audit script scans only src/app/**/actions.ts; it will not see
  // this write. That is correct — do not add audit-exempt annotations to actions.ts.
  RATE_LIMIT_BLOCKED: "rate_limit.blocked",
  // Email queue — system event; written from src/lib/email/queue.ts (not an
  // actions.ts file, so not covered by the check:audit tripwire — intentional).
  EMAIL_QUEUE_PERMANENT_FAILURE: "email.queue.permanent_failure",
  // Access gate — written from src/app/access-pending/page.tsx during RSC
  // render, not from an actions.ts file. The check:audit tripwire scans only
  // src/app/**/actions.ts and will not see this write. That is intentional —
  // the page component is the audit site. This follows the RATE_LIMIT_BLOCKED
  // and EMAIL_QUEUE_PERMANENT_FAILURE precedents above.
  ACCESS_DENIED: "access.denied",
  // Account lockout — infrastructure event written from src/auth.ts authorize()
  // (not an actions.ts file, so not covered by the check:audit tripwire —
  // intentional, same pattern as RATE_LIMIT_BLOCKED and EMAIL_QUEUE_PERMANENT_FAILURE).
  USER_ACCOUNT_LOCKED: "user.account_locked",
  // Admin-initiated account unlock — written from src/app/(admin)/admin/users/actions.ts.
  // The check:audit tripwire scans that file and requires the AUDIT_ACTIONS reference.
  USER_ACCOUNT_UNLOCKED: "user.account_unlocked",
  // What's-new entries — written from src/app/(admin)/admin/whats-new/actions.ts.
  // kit-module:whats-new-begin
  WHATS_NEW_ENTRY_CREATED: "whats_new.entry_created",
  WHATS_NEW_ENTRY_UPDATED: "whats_new.entry_updated",
  WHATS_NEW_ENTRY_DELETED: "whats_new.entry_deleted",
  // kit-module:whats-new-end
  // Device auth (module `mobile`, 2026-09-11-phase-4-mobile).
  // DEVICE_REGISTERED is written from src/app/api/devices/route.ts — a route
  // handler, not an actions.ts file, so check:audit will not see it (same
  // documented precedent as RATE_LIMIT_BLOCKED). Registration is the
  // credential-minting event, so it is audited despite living in a route.
  // DEVICE_REVOKED / DEVICE_PAIRING_CODE_CREATED are written from
  // src/app/(account)/account/devices/actions.ts (and the platform Admin's
  // devices actions for operator revokes), which check:audit does scan.
  // Heartbeats and push-token refreshes are deliberately NOT audited:
  // high-frequency, no privilege change.
  // kit-module:device-auth-begin
  DEVICE_REGISTERED: "device.registered",
  DEVICE_REVOKED: "device.revoked",
  DEVICE_PAIRING_CODE_CREATED: "device.pairing_code_created",
  // kit-module:device-auth-end
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// ---------------------------------------------------------------------------
// recordAudit() — centralized audit-event writer
// ---------------------------------------------------------------------------

/**
 * Explicit actor override. Pass to recordAudit() when the actor is already
 * resolved (unauthenticated flows, or sites where auth() was already called).
 */
export type AuditActorOverride = {
  userId: string | null;
  email: string | null;
};

export interface RecordAuditInput {
  /** Typed against the string-value union of AUDIT_ACTIONS. */
  action: AuditAction;
  /**
   * Actor resolution:
   *   undefined (omitted) — call auth() to get the signed-in session.
   *   { userId, email }   — explicit override (unauthenticated flows, or call
   *                         sites where auth() is already resolved; avoids a
   *                         redundant JWT read).
   *   null                — system write; no actor (seed scripts, future crons).
   */
  actor?: AuditActorOverride | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Write a row to audit_events.
 *
 * - Auto-resolves actor from the current session when `actor` is omitted.
 * - Populates `ip` and `user_agent` from the incoming request headers.
 * - Swallows all failures with `console.error` so an audit write never takes
 *   down the mutation it records.
 * - Safe to call from seed scripts and cron jobs: if `headers()` is unavailable
 *   (no request context), ip and userAgent are null and the insert still runs.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  // Mechanism moved to @repo/auth's recordAuditShared (2026-09-05) — Portal's
  // and the platform Admin's copies were identical apart from this log prefix.
  // The TABLE stays app-local on purpose: per-app audit_events in per-app
  // Postgres schemas (DECISION-007), so write paths stay independent. Only
  // the write path is shared, not the storage.
  await recordAuditShared(input, {
    db,
    auditEvents,
    resolveSession: async () => {
      const { auth } = await import("@/auth");
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
    logPrefix: "[audit]",
  });
}

