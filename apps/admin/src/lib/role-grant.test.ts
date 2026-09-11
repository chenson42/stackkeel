/**
 * Tests for src/lib/role-grant.ts — the ONE helper both setRoleGrantAction
 * (/users/[id]) and approveRequestAction (/requests) call to change a role
 * binding, and therefore the single place ADMIN decides what its audit trail
 * says about privilege changes across all three apps.
 *
 * This module had zero coverage before 2026-09-07.
 *
 * The two cases that matter most are `records NO audit event when the row
 * already existed` and its revoke twin. Both FAIL against the pre-2026-09-07
 * implementation, which wrote ADMIN_ROLE_GRANTED / ADMIN_ROLE_REVOKED
 * unconditionally — fabricating audit evidence of a privilege change that
 * never happened whenever the role matrix was re-saved unchanged, or a
 * request was approved for someone who already held the role. See
 * apps/admin/docs/work-log/2026-09-07-role-grant-false-audit-events.md.
 *
 * The DB is mocked at the query-builder boundary rather than run against real
 * Postgres: the behaviour under test is "does the audit call happen", which is
 * decided entirely by what `.returning()` resolves to. `.returning()` yielding
 * [] is exactly what Postgres does for an ON CONFLICT DO NOTHING that inserted
 * nothing and for a DELETE that matched nothing.
 */

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/schema", () => ({
  roles: { id: "roles.id" },
  userRoles: { id: "user_roles.id", userId: "user_roles.user_id", roleId: "user_roles.role_id" },
}));

const mockFindFirst = vi.hoisted(() => vi.fn());
const mockReturningInsert = vi.hoisted(() => vi.fn());
const mockReturningDelete = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    query: { roles: { findFirst: mockFindFirst } },
    select: mockSelect,
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: mockReturningInsert }),
      }),
    }),
    delete: () => ({
      where: () => ({ returning: mockReturningDelete }),
    }),
  },
}));

const mockRecordAudit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/audit", () => ({
  recordAudit: mockRecordAudit,
  AUDIT_ACTIONS: {
    ADMIN_ROLE_GRANTED: "platform.role.granted",
    ADMIN_ROLE_REVOKED: "platform.role.revoked",
    ADMIN_CROSS_NAMESPACE_REJECTED: "platform.cross_namespace.rejected",
  },
}));

vi.mock("@repo/permissions", () => ({
  isKnownRoleName: (n: string) =>
    n.startsWith("admin_") ||
    n.startsWith("portal_") ||
    n.startsWith("billing_") ||
    ["admin", "staff", "member"].includes(n),
  // task-auth-onto-roles (DECISION-017), Increment 3: grantOrRevokeRole's
  // new persona pre-check does `PORTAL_PERSONA_ROLE_NAMES.includes(role.name)`.
  // REAL_ROLE below is "billing_editor", never a member of this set, so
  // real values are safe for every existing test in this file — the
  // pre-check's own db.select() branch is never reached by them. Dedicated
  // persona-conflict coverage is its own describe block, below.
  PORTAL_PERSONA_ROLE_NAMES: ["admin", "staff", "member"],
}));

// drizzle-orm is NOT mocked here (never was, before this Increment) — its
// real eq/and/inArray are pure condition-builders with no DB connection;
// role-grant.ts already relied on the real ones for its pre-existing
// delete-path `and(eq(...), eq(...))` before this change, and the
// pre-check's own `.from().innerJoin().where()` chain is fully mocked below
// regardless of what real SQL-condition object eq/and/inArray produce.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { grantOrRevokeRole } from "./role-grant";

const TARGET = "11111111-1111-1111-1111-111111111111";
const ROLE_ID = "22222222-2222-2222-2222-222222222222";
const REAL_ROLE = { id: ROLE_ID, name: "billing_editor" };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindFirst.mockResolvedValue(REAL_ROLE);
});

describe("grantOrRevokeRole — grant", () => {
  it("records ADMIN_ROLE_GRANTED when a row is actually inserted", async () => {
    mockReturningInsert.mockResolvedValue([{ id: "new-row" }]);

    const result = await grantOrRevokeRole({ targetUserId: TARGET, roleId: ROLE_ID, granted: true });

    expect(result).toEqual({ ok: true });
    expect(mockRecordAudit).toHaveBeenCalledTimes(1);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "platform.role.granted", resourceId: TARGET }),
    );
  });

  it("records NO audit event when the user already held the role (REGRESSION)", async () => {
    // ON CONFLICT DO NOTHING that inserted nothing → returning() yields [].
    mockReturningInsert.mockResolvedValue([]);

    const result = await grantOrRevokeRole({ targetUserId: TARGET, roleId: ROLE_ID, granted: true });

    // Still success: the caller asked for a desired end state, and it holds.
    expect(result).toEqual({ ok: true });
    // But nothing changed, so nothing is claimed to have changed.
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });
});

describe("grantOrRevokeRole — revoke", () => {
  it("records ADMIN_ROLE_REVOKED when a row is actually deleted", async () => {
    mockReturningDelete.mockResolvedValue([{ id: "gone-row" }]);

    const result = await grantOrRevokeRole({ targetUserId: TARGET, roleId: ROLE_ID, granted: false });

    expect(result).toEqual({ ok: true });
    expect(mockRecordAudit).toHaveBeenCalledTimes(1);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "platform.role.revoked", resourceId: TARGET }),
    );
  });

  it("records NO audit event when the user did not hold the role (REGRESSION)", async () => {
    mockReturningDelete.mockResolvedValue([]);

    const result = await grantOrRevokeRole({ targetUserId: TARGET, roleId: ROLE_ID, granted: false });

    expect(result).toEqual({ ok: true });
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });
});

describe("grantOrRevokeRole — cross-namespace guard (unchanged behaviour)", () => {
  it("rejects and audits a role name outside the known allowlist", async () => {
    mockFindFirst.mockResolvedValue({ id: ROLE_ID, name: "some_other_app_admin" });

    const result = await grantOrRevokeRole({ targetUserId: TARGET, roleId: ROLE_ID, granted: true });

    expect(result).toEqual({
      ok: false,
      error: "That role cannot be assigned from Admin.",
    });
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "platform.cross_namespace.rejected" }),
    );
  });

  it("rejects when the roleId does not resolve to a real role", async () => {
    mockFindFirst.mockResolvedValue(undefined);

    const result = await grantOrRevokeRole({ targetUserId: TARGET, roleId: ROLE_ID, granted: true });

    expect(result).toEqual({
      ok: false,
      error: "That role cannot be assigned from Admin.",
    });
    // The rejection itself is audited with a null roleName — that IS a real
    // event (someone attempted it), unlike the no-op cases above.
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "platform.cross_namespace.rejected",
        metadata: expect.objectContaining({ roleName: null }),
      }),
    );
  });
});

// task-auth-onto-roles (DECISION-017), Increment 3, ruling 2's finding: a
// grant that violates the persona-exclusivity trigger must be rejected with
// a friendly error BEFORE the insert, and must record NO audit event — the
// exact "false audit event" failure mode ruling 2 itself found. See the
// Test Strategy table's "Granting staff to a member-holding user directly
// via grantOrRevokeRole... still returns {ok:false} and writes no
// ADMIN_ROLE_GRANTED audit row."
