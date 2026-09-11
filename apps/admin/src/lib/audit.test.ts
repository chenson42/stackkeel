/**
 * Tests for src/lib/audit.ts — this app had ZERO coverage of its audit
 * write path before this file (QA test-coverage review, 2026-09-05), even
 * though it is, per that module's own header, "the single highest-audit-
 * priority surface in this entire initiative": role grants/revokes, invite
 * consumption, self-target/cross-namespace rejection, TOTP enrolment, flag
 * mutation, and account-lockout all funnel through recordAudit().
 *
 * Adapted from apps/portal/src/lib/audit.test.ts's already-established
 * pattern for the identical recordAuditShared() wrapper shape — this app's
 * recordAudit() differs from Portal's only in its AUDIT_ACTIONS catalog and
 * its "[platform-admin audit]" log prefix.
 *
 * Two suites:
 * 1. AUDIT_ACTIONS catalog — regression guard for audit-string drift.
 * 2. recordAudit() — actor resolution, ip/user-agent extraction, and
 *    failure-swallowing, exercised against a mocked recordAuditShared() so
 *    this app's wrapper is tested in isolation from the shared mechanism
 *    (which is @repo/auth's own concern, not this app's).
 */

// vi.mock() calls are hoisted before imports by Vitest's transform.
vi.mock("server-only", () => ({}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/lib/db/schema", () => ({
  auditEvents: {},
}));

vi.mock("@/lib/request-ip", () => ({
  getRequestIp: vi.fn(),
}));

const mockRecordAuditShared = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@repo/auth/audit", () => ({
  recordAuditShared: mockRecordAuditShared,
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AUDIT_ACTIONS, recordAudit } from "./audit";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { getRequestIp } from "@/lib/request-ip";

// ---------------------------------------------------------------------------
// AUDIT_ACTIONS catalog — regression for audit-string drift
//
// If any entry is renamed, added, or removed without updating this list, a
// stale action string could ship to a live audit_events row unnoticed —
// exactly the drift class apps/portal/src/lib/audit.test.ts already guards
// against for Portal's own catalog.
// ---------------------------------------------------------------------------

const EXPECTED_ENTRIES: Record<keyof typeof AUDIT_ACTIONS, string> = {
  // kit-module:whats-new-begin
  WHATS_NEW_ENTRY_CREATED: "admin.whats_new.created",
  WHATS_NEW_ENTRY_UPDATED: "admin.whats_new.updated",
  WHATS_NEW_ENTRY_DELETED: "admin.whats_new.deleted",
  // kit-module:whats-new-end
  ADMIN_USER_CREATED: "admin.user.created",
  ADMIN_INVITE_SENT: "admin.invite.sent",
  ADMIN_INVITE_CONSUMED: "admin.invite.consumed",
  ADMIN_ROLE_GRANTED: "admin.role.granted",
  ADMIN_ROLE_REVOKED: "admin.role.revoked",
  ADMIN_ROLE_FEATURE_GRANTED: "admin.role_feature.granted",
  ADMIN_ROLE_FEATURE_REVOKED: "admin.role_feature.revoked",
  ADMIN_ROLE_FEATURE_PROTECTED_BLOCKED: "admin.role_feature.protected_blocked",
  ADMIN_SELF_TARGET_BLOCKED: "admin.self_target.blocked",
  ADMIN_CROSS_NAMESPACE_REJECTED: "admin.role.namespace_rejected",
  ADMIN_REQUEST_APPROVED: "admin.request.approved",
  ADMIN_REQUEST_REJECTED: "admin.request.rejected",
  TOTP_ENROLLED: "totp.enrolled",
  TOTP_VERIFY_FAILED: "totp.verify_failed",
  TOTP_RECOVERY_SUCCESS: "totp.recovery_succeeded",
  TOTP_RECOVERY_FAILED: "totp.recovery_failed",
  ADMIN_MFA_RESET: "admin.mfa.reset",
  ADMIN_PASSWORD_CHANGED: "admin.password.changed",
  ADMIN_ACCESS_DENIED: "admin.access.denied",
  RATE_LIMIT_BLOCKED: "rate_limit.blocked",
  // kit-module:flags-admin-begin
  FLAG_UPDATED: "admin.flag.updated",
  // kit-module:flags-admin-end
  // kit-module:helpdesk-begin
  TICKET_STATUS_CHANGED: "ticket.status_changed",
  TICKET_ASSIGNED: "ticket.assigned",
  TICKET_RECLASSIFIED: "ticket.reclassified",
  TICKET_AREA_CHANGED: "ticket.area_changed",
  TICKET_PRIORITY_CHANGED: "ticket.priority_changed",
  FEEDBACK_PROMOTED_TO_TICKET: "feedback.promoted_to_ticket",
  // kit-module:helpdesk-end
  BRANDING_UPDATED: "branding.updated",
  // Device auth (module `mobile`, 2026-09-11-phase-4-mobile)
  // kit-module:device-auth-begin
  DEVICE_REVOKED: "device.revoked",
  APP_RELEASE_POLICY_UPDATED: "app_release.policy_updated",
  // kit-module:device-auth-end
};

const EXPECTED_COUNT = Object.keys(EXPECTED_ENTRIES).length;

describe("AUDIT_ACTIONS catalog — regression for audit-string drift", () => {
  it(`has exactly ${EXPECTED_COUNT} entries`, () => {
    expect(Object.keys(AUDIT_ACTIONS)).toHaveLength(EXPECTED_COUNT);
  });

  it("exports every expected key with its exact frozen string value", () => {
    for (const [key, value] of Object.entries(EXPECTED_ENTRIES) as Array<
      [keyof typeof AUDIT_ACTIONS, string]
    >) {
      expect(AUDIT_ACTIONS[key]).toBe(value);
    }
  });

  it(`has no extra keys beyond the ${EXPECTED_COUNT} expected entries`, () => {
    const expectedKeys = new Set(Object.keys(EXPECTED_ENTRIES));
    for (const key of Object.keys(AUDIT_ACTIONS)) {
      expect(expectedKeys.has(key)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// recordAudit() — wrapper behavior
// ---------------------------------------------------------------------------

function makeHeaders(map: Record<string, string> = {}) {
  return {
    get: (name: string) => map[name.toLowerCase()] ?? null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRecordAuditShared.mockResolvedValue(undefined);
});

describe("recordAudit() — delegates to recordAuditShared with this app's own deps", () => {
  it("passes the input straight through and stamps logPrefix '[platform-admin audit]'", async () => {
    await recordAudit({
      action: AUDIT_ACTIONS.ADMIN_ROLE_GRANTED,
      resourceType: "role",
      resourceId: "role-1",
      metadata: { roleId: "role-1" },
    });

    expect(mockRecordAuditShared).toHaveBeenCalledOnce();
    const [input, deps] = mockRecordAuditShared.mock.calls[0];
    expect(input).toMatchObject({
      action: "admin.role.granted",
      resourceType: "role",
      resourceId: "role-1",
      metadata: { roleId: "role-1" },
    });
    expect(deps.logPrefix).toBe("[platform-admin audit]");
    expect(deps.auditEvents).toBeDefined();
    expect(deps.db).toBeDefined();
  });

  it("has NO try/catch of its own — a rejected recordAuditShared() call propagates through recordAudit()", async () => {
    // recordAudit() itself adds no error handling; the never-throw guarantee
    // lives entirely inside recordAuditShared() (packages/auth/src/audit.ts's
    // own try/catch, tested there). This test pins that division of
    // responsibility: if a future edit adds a redundant try/catch here (or
    // removes recordAuditShared's), this is the test that will need to
    // change on purpose, rather than the gap being silent.
    mockRecordAuditShared.mockRejectedValueOnce(new Error("boom"));

    await expect(
      recordAudit({ action: AUDIT_ACTIONS.ADMIN_ACCESS_DENIED }),
    ).rejects.toThrow("boom");
  });
});

describe("recordAudit() — resolveSession dependency", () => {
  it("resolves { userId, email } from a signed-in session", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", email: "admin@the ancestor site" },
    } as never);

    await recordAudit({ action: AUDIT_ACTIONS.ADMIN_USER_CREATED });

    const deps = mockRecordAuditShared.mock.calls[0][1];
    const session = await deps.resolveSession();
    expect(session).toEqual({ userId: "admin-1", email: "admin@the ancestor site" });
  });

  it("resolves { userId: null, email: null } when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    await recordAudit({ action: AUDIT_ACTIONS.ADMIN_USER_CREATED });

    const deps = mockRecordAuditShared.mock.calls[0][1];
    const session = await deps.resolveSession();
    expect(session).toEqual({ userId: null, email: null });
  });
});

describe("recordAudit() — resolveRequestContext dependency", () => {
  it("resolves ip and userAgent from real request headers", async () => {
    vi.mocked(headers).mockResolvedValue(
      makeHeaders({ "user-agent": "Mozilla/5.0" }) as never,
    );
    vi.mocked(getRequestIp).mockReturnValue("1.2.3.4");

    await recordAudit({ action: AUDIT_ACTIONS.ADMIN_USER_CREATED });

    const deps = mockRecordAuditShared.mock.calls[0][1];
    const ctx = await deps.resolveRequestContext();
    expect(ctx).toEqual({ ip: "1.2.3.4", userAgent: "Mozilla/5.0" });
  });

  it("resolves { ip: null, userAgent: null } when headers() throws (seed script / cron, no request context)", async () => {
    vi.mocked(headers).mockRejectedValue(
      new Error("headers() called outside request scope"),
    );

    await recordAudit({ action: AUDIT_ACTIONS.ADMIN_USER_CREATED });

    const deps = mockRecordAuditShared.mock.calls[0][1];
    const ctx = await deps.resolveRequestContext();
    expect(ctx).toEqual({ ip: null, userAgent: null });
  });
});
