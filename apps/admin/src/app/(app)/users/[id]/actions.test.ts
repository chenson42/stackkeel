/**
 * Tests for setRoleGrantAction's self-target rule.
 *
 * Context: until 2026-09-06 this action refused ANY self-targeted change as its
 * first statement. It now allows self-editing with exactly one exception — the
 * last remaining Admin admin cannot remove their own admin role, which
 * would leave nobody able to administer any of the three apps.
 *
 * That exception is the whole security surface of the change, so it is what
 * these tests pin. The cases that matter are the boundaries: last admin vs. one
 * other admin, revoke vs. grant, admin role vs. any other role, and self vs.
 * someone else.
 *
 * See docs/work-log/2026-09-06-admin-self-role-editing.md (in a predecessor app,
 * the cross-app backlog home) for why the blanket guard was narrowed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const auth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => auth() }));

const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  recordAudit: (...a: unknown[]) => recordAudit(...a),
  AUDIT_ACTIONS: {
    ADMIN_SELF_TARGET_BLOCKED: "admin.self_target.blocked",
    ADMIN_MFA_RESET: "admin.mfa.reset",
  },
}));

const grantOrRevokeRole = vi.fn();
vi.mock("@/lib/role-grant", () => ({
  grantOrRevokeRole: (...a: unknown[]) => grantOrRevokeRole(...a),
}));

vi.mock("@repo/permissions", () => ({
  FEATURES: { ADMIN_USERS: "admin.users" },
  hasFeature: (features: string[], key: string) => features.includes(key),
  APP_ROLE_NAMESPACES: { portal: ["admin", "member"], admin: ["admin"] },
  isKnownRoleName: (name: string) => ["admin", "member"].includes(name),
}));

vi.mock("@/lib/admin-app-roles", () => ({
  isAdminAppRole: (name: string) => name === "admin",
}));

// `db` is stubbed per-test: findFirst resolves the role, and the select chain
// returns the count of OTHER users holding it.
const findFirst = vi.fn();
const selectWhere = vi.fn();

// resetMfaAction's own db surface — separate mocks so setRoleGrantAction's
// existing tests above are untouched. `usersFindFirst` resolves the target
// user lookup; `deleteCalls` records which TABLE each db.delete() call
// targeted (not just that delete was called) so the batch test below can
// assert the EFFECT (both tables, not one) — same discipline
// a predecessor app's src/app/api/users/[id]/reset-mfa/route.test.ts's own mock
// uses for the identical bug class (a delete that silently only touches
// one of the two tables it must touch atomically).
const usersFindFirst = vi.fn();
const batchMock = vi.fn(async (queries: unknown[]) => queries.map(() => undefined));
const deleteCalls: unknown[] = [];
function makeDeleteBuilder(table: unknown) {
  return {
    where: (cond: unknown) => {
      deleteCalls.push(table);
      return { __table: table, __where: cond };
    },
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      roles: { findFirst: (...a: unknown[]) => findFirst(...a) },
      users: { findFirst: (...a: unknown[]) => usersFindFirst(...a) },
    },
    select: () => ({ from: () => ({ where: (...a: unknown[]) => selectWhere(...a) }) }),
    delete: (table: unknown) => makeDeleteBuilder(table),
    batch: (...a: [unknown[]]) => batchMock(...a),
  },
}));

const USERS_TABLE = { __name: "users" };
const USER_TOTP_TABLE = { __name: "userTotp" };
const USER_TOTP_RECOVERY_CODES_TABLE = { __name: "userTotpRecoveryCodes" };

vi.mock("@/lib/db/schema", () => ({
  roles: { id: "roles.id", name: "roles.name" },
  userRoles: { userId: "user_roles.user_id", roleId: "user_roles.role_id" },
  users: USERS_TABLE,
  userTotp: USER_TOTP_TABLE,
  userTotpRecoveryCodes: USER_TOTP_RECOVERY_CODES_TABLE,
}));

// drizzle-orm helpers are identity stubs — these tests assert control flow and
// outcomes, not generated SQL. The real query is covered by the app's own
// integration surface, not here.
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (a: unknown, b: unknown) => [a, b],
  ne: (a: unknown, b: unknown) => [a, b],
  countDistinct: (c: unknown) => c,
}));

const { setRoleGrantAction, resetMfaAction } = await import("./actions");

const SELF = "self-uuid";
const OTHER = "other-uuid";
const ADMIN_ROLE = "role-admin-uuid";

function signedInAsAdmin() {
  auth.mockResolvedValue({
    user: { id: SELF, features: ["admin.users"] },
  });
}

/** Stub the "how many OTHER users hold this role" count. */
function othersHoldingRole(n: number) {
  selectWhere.mockResolvedValue([{ others: n }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  signedInAsAdmin();
  grantOrRevokeRole.mockResolvedValue({ ok: true });
});

describe("setRoleGrantAction — last-admin guard", () => {
  it("BLOCKS the last admin removing their own admin role", async () => {
    findFirst.mockResolvedValue({ id: ADMIN_ROLE, name: "admin" });
    othersHoldingRole(0);

    const res = await setRoleGrantAction({
      targetUserId: SELF,
      roleId: ADMIN_ROLE,
      granted: false,
    });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/only Admin admin/i);
    // Never reaches the mutation.
    expect(grantOrRevokeRole).not.toHaveBeenCalled();
  });

  it("audits the block, with a reason distinguishing it from the old blanket guard", async () => {
    findFirst.mockResolvedValue({ id: ADMIN_ROLE, name: "admin" });
    othersHoldingRole(0);

    await setRoleGrantAction({ targetUserId: SELF, roleId: ADMIN_ROLE, granted: false });

    expect(recordAudit).toHaveBeenCalledOnce();
    const [arg] = recordAudit.mock.calls[0] as [Record<string, unknown>];
    expect(arg.action).toBe("admin.self_target.blocked");
    expect((arg.metadata as Record<string, unknown>).reason).toBe("last_admin");
  });

  it("ALLOWS removing your own admin role when another admin exists", async () => {
    findFirst.mockResolvedValue({ id: ADMIN_ROLE, name: "admin" });
    othersHoldingRole(1);

    const res = await setRoleGrantAction({
      targetUserId: SELF,
      roleId: ADMIN_ROLE,
      granted: false,
    });

    expect(res.ok).toBe(true);
    expect(grantOrRevokeRole).toHaveBeenCalledOnce();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("ALLOWS granting yourself a role — the guard is revoke-only", async () => {
    const res = await setRoleGrantAction({
      targetUserId: SELF,
      roleId: ADMIN_ROLE,
      granted: true,
    });

    expect(res.ok).toBe(true);
    expect(grantOrRevokeRole).toHaveBeenCalledOnce();
    // A grant must not even look the role up for this purpose.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("ALLOWS revoking a NON-admin role from yourself, even as the last admin", async () => {
    findFirst.mockResolvedValue({ id: "role-billing", name: "billing_editor" });
    othersHoldingRole(0);

    const res = await setRoleGrantAction({
      targetUserId: SELF,
      roleId: "role-a predecessor app",
      granted: false,
    });

    expect(res.ok).toBe(true);
    expect(grantOrRevokeRole).toHaveBeenCalledOnce();
  });

  it("does not apply the guard to OTHER users — only to yourself", async () => {
    findFirst.mockResolvedValue({ id: ADMIN_ROLE, name: "admin" });
    othersHoldingRole(0);

    const res = await setRoleGrantAction({
      targetUserId: OTHER,
      roleId: ADMIN_ROLE,
      granted: false,
    });

    expect(res.ok).toBe(true);
    expect(grantOrRevokeRole).toHaveBeenCalledOnce();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("still requires ADMIN_USERS before any of this runs", async () => {
    auth.mockResolvedValue({ user: { id: SELF, features: [] } });

    const res = await setRoleGrantAction({
      targetUserId: SELF,
      roleId: ADMIN_ROLE,
      granted: false,
    });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe("Forbidden.");
    expect(findFirst).not.toHaveBeenCalled();
    expect(grantOrRevokeRole).not.toHaveBeenCalled();
  });

  it("resolves the role from the DB, so a client-supplied id cannot steer the branch", async () => {
    // The client sends an id; the action must decide from the role's real name.
    findFirst.mockResolvedValue({ id: ADMIN_ROLE, name: "admin" });
    othersHoldingRole(0);

    await setRoleGrantAction({ targetUserId: SELF, roleId: ADMIN_ROLE, granted: false });

    expect(findFirst).toHaveBeenCalledOnce();
  });
});

/**
 * Tests for resetMfaAction — 2FA atomic-convergence Increment 3 (2026-09-08
 * — apps/portal/docs/work-log/2026-09-08-2fa-atomic-convergence.md Phase 3
 * § 3.6; root docs/decisions.md DECISION-022 point 4).
 *
 * The load-bearing assertion throughout is the EFFECT — both userTotp AND
 * userTotpRecoveryCodes are the target of a delete inside ONE db.batch()
 * call — not merely that db.delete()/db.batch() was invoked at all. A
 * single-table delete (the exact bug this increment's a predecessor app prerequisite
 * fix also closed there) would satisfy a call-count assertion but leave
 * stale recovery codes valid forever; these tests are written so that bug
 * shape fails them.
 */
describe("resetMfaAction", () => {
  const TARGET = "target-uuid";

  beforeEach(() => {
    deleteCalls.length = 0;
  });

  it("deletes both userTotp and userTotpRecoveryCodes rows in ONE db.batch() call, and audits ADMIN_MFA_RESET", async () => {
    usersFindFirst.mockResolvedValue({ id: TARGET, email: "target@example.com" });

    const res = await resetMfaAction({ targetUserId: TARGET });

    expect(res.ok).toBe(true);
    expect(batchMock).toHaveBeenCalledOnce();
    expect(deleteCalls).toHaveLength(2);
    expect(deleteCalls).toContainEqual(USER_TOTP_TABLE);
    expect(deleteCalls).toContainEqual(USER_TOTP_RECOVERY_CODES_TABLE);

    expect(recordAudit).toHaveBeenCalledOnce();
    const [arg] = recordAudit.mock.calls[0] as [Record<string, unknown>];
    expect(arg.action).toBe("admin.mfa.reset");
    expect(arg.resourceId).toBe(TARGET);
    expect((arg.metadata as Record<string, unknown>).targetEmail).toBe("target@example.com");
  });

  it("returns Forbidden and touches nothing when the caller lacks ADMIN_USERS", async () => {
    auth.mockResolvedValue({ user: { id: SELF, features: [] } });

    const res = await resetMfaAction({ targetUserId: TARGET });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe("Forbidden.");
    expect(usersFindFirst).not.toHaveBeenCalled();
    expect(batchMock).not.toHaveBeenCalled();
  });

  it("returns 'User not found.' and touches nothing when the target doesn't exist", async () => {
    usersFindFirst.mockResolvedValue(undefined);

    const res = await resetMfaAction({ targetUserId: "missing" });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe("User not found.");
    expect(batchMock).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("ALLOWS self-target (no block) — deliberate ruling, see this file's own resetMfaAction header — and audits selfTarget: true", async () => {
    usersFindFirst.mockResolvedValue({ id: SELF, email: "self@example.com" });

    const res = await resetMfaAction({ targetUserId: SELF });

    expect(res.ok).toBe(true);
    expect(batchMock).toHaveBeenCalledOnce();
    const [arg] = recordAudit.mock.calls[0] as [Record<string, unknown>];
    expect((arg.metadata as Record<string, unknown>).selfTarget).toBe(true);
  });

  it("audits selfTarget: false when targeting someone else", async () => {
    usersFindFirst.mockResolvedValue({ id: TARGET, email: "target@example.com" });

    await resetMfaAction({ targetUserId: TARGET });

    const [arg] = recordAudit.mock.calls[0] as [Record<string, unknown>];
    expect((arg.metadata as Record<string, unknown>).selfTarget).toBe(false);
  });
});
