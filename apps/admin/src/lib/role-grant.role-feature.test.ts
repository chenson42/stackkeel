/**
 * Mocked-DB unit tests for grantOrRevokeRoleFeature (src/lib/role-grant.ts)
 * — the write path for /roles (role x feature grid). Origin: 2026-09-09-
 * roles-permissions-ux Phase 3 § 2/§ 3, this pass's own task brief.
 *
 * Covers: grant, revoke, the .returning()-gated no-op/audit behaviour
 * (same discipline as grantOrRevokeRole's own suite, role-grant.test.ts),
 * and the protected-floor rejection for admin.
 *
 * The DB is mocked at the query-builder boundary — this file's own claim
 * is "does grantOrRevokeRoleFeature call the right things in the right
 * order, and does it short-circuit before ever writing when the protected
 * floor applies." The complementary claim — "does bumpRolesVersionForRole's
 * own SQL actually reach every holder and nobody else" — is proven against
 * REAL Postgres in role-grant.roles-version.integration.test.ts; a mock
 * cannot prove that half, so this file does not attempt to.
 */

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/schema", () => ({
  roles: { id: "roles.id" },
  features: { key: "features.key" },
  roleFeatures: {
    id: "role_features.id",
    roleId: "role_features.role_id",
    featureKey: "role_features.feature_key",
  },
}));

const mockRolesFindFirst = vi.hoisted(() => vi.fn());
const mockFeaturesFindFirst = vi.hoisted(() => vi.fn());
const mockReturningInsert = vi.hoisted(() => vi.fn());
const mockReturningDelete = vi.hoisted(() => vi.fn());
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockDeleteWhere = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      roles: { findFirst: mockRolesFindFirst },
      features: { findFirst: mockFeaturesFindFirst },
    },
    insert: () => ({
      values: (v: unknown) => {
        mockInsertValues(v);
        return { onConflictDoNothing: () => ({ returning: mockReturningInsert }) };
      },
    }),
    delete: () => ({
      where: (w: unknown) => {
        mockDeleteWhere(w);
        return { returning: mockReturningDelete };
      },
    }),
  },
}));

const mockRecordAudit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/audit", () => ({
  recordAudit: mockRecordAudit,
  AUDIT_ACTIONS: {
    ADMIN_ROLE_FEATURE_GRANTED: "admin.role_feature.granted",
    ADMIN_ROLE_FEATURE_REVOKED: "admin.role_feature.revoked",
    ADMIN_ROLE_FEATURE_PROTECTED_BLOCKED: "admin.role_feature.protected_blocked",
  },
}));

const mockBumpRolesVersionForRole = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/roles-version", () => ({
  bumpRolesVersionForRole: mockBumpRolesVersionForRole,
}));

vi.mock("@repo/permissions", () => ({
  FEATURES: { ADMIN_ROLES: "admin.roles", ADMIN_USERS: "admin.users" },
  isKnownRoleName: () => true,
  PORTAL_PERSONA_ROLE_NAMES: [],
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import { grantOrRevokeRoleFeature } from "./role-grant";

const ROLE_ID = "33333333-3333-3333-3333-333333333333";
const ORDINARY_ROLE = { id: ROLE_ID, name: "billing_editor" };
const ADMIN_ROLE = { id: ROLE_ID, name: "admin" };
const FEATURE = { key: "admin.audit", name: "Cross-app audit log" };
const PROTECTED_FEATURE = { key: "admin.roles", name: "Manage role permissions" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRolesFindFirst.mockResolvedValue(ORDINARY_ROLE);
  mockFeaturesFindFirst.mockResolvedValue(FEATURE);
});

describe("grantOrRevokeRoleFeature — role/feature resolution", () => {
  it("rejects a roleId that does not resolve to a real role", async () => {
    mockRolesFindFirst.mockResolvedValue(undefined);

    const result = await grantOrRevokeRoleFeature({
      roleId: ROLE_ID,
      featureKey: FEATURE.key,
      granted: true,
    });

    expect(result).toEqual({ ok: false, error: "Role not found." });
    expect(mockFeaturesFindFirst).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("rejects a featureKey that does not resolve to a real feature", async () => {
    mockFeaturesFindFirst.mockResolvedValue(undefined);

    const result = await grantOrRevokeRoleFeature({
      roleId: ROLE_ID,
      featureKey: "not.a.real.key",
      granted: true,
    });

    expect(result).toEqual({ ok: false, error: "Feature not found." });
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});

describe("grantOrRevokeRoleFeature — grant", () => {
  it("inserts, bumps rolesVersion, and audits ADMIN_ROLE_FEATURE_GRANTED when a row is actually inserted", async () => {
    mockReturningInsert.mockResolvedValue([{ id: "new-row" }]);

    const result = await grantOrRevokeRoleFeature({
      roleId: ROLE_ID,
      featureKey: FEATURE.key,
      granted: true,
    });

    expect(result).toEqual({ ok: true });
    expect(mockInsertValues).toHaveBeenCalledWith({ roleId: ROLE_ID, featureKey: FEATURE.key });
    expect(mockBumpRolesVersionForRole).toHaveBeenCalledTimes(1);
    expect(mockBumpRolesVersionForRole).toHaveBeenCalledWith(expect.anything(), ROLE_ID);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.role_feature.granted",
        resourceId: ROLE_ID,
        metadata: { featureKey: FEATURE.key, roleName: ORDINARY_ROLE.name },
      }),
    );
  });

  it("records NO audit event and does NOT bump rolesVersion when the pair was already bound (REGRESSION shape)", async () => {
    // ON CONFLICT DO NOTHING that inserted nothing → returning() yields [].
    mockReturningInsert.mockResolvedValue([]);

    const result = await grantOrRevokeRoleFeature({
      roleId: ROLE_ID,
      featureKey: FEATURE.key,
      granted: true,
    });

    expect(result).toEqual({ ok: true });
    expect(mockBumpRolesVersionForRole).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });
});

describe("grantOrRevokeRoleFeature — revoke", () => {
  it("deletes, bumps rolesVersion, and audits ADMIN_ROLE_FEATURE_REVOKED when a row is actually deleted", async () => {
    mockReturningDelete.mockResolvedValue([{ id: "gone-row" }]);

    const result = await grantOrRevokeRoleFeature({
      roleId: ROLE_ID,
      featureKey: FEATURE.key,
      granted: false,
    });

    expect(result).toEqual({ ok: true });
    expect(mockBumpRolesVersionForRole).toHaveBeenCalledTimes(1);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.role_feature.revoked",
        resourceId: ROLE_ID,
        metadata: { featureKey: FEATURE.key, roleName: ORDINARY_ROLE.name },
      }),
    );
  });

  it("records NO audit event and does NOT bump rolesVersion when the pair was not bound", async () => {
    mockReturningDelete.mockResolvedValue([]);

    const result = await grantOrRevokeRoleFeature({
      roleId: ROLE_ID,
      featureKey: FEATURE.key,
      granted: false,
    });

    expect(result).toEqual({ ok: true });
    expect(mockBumpRolesVersionForRole).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });
});

describe("grantOrRevokeRoleFeature — protected floor (Chris's ruling, 2026-09-09)", () => {
  it("blocks revoking ADMIN_ROLES from admin, audits the block, and never reaches the delete", async () => {
    mockRolesFindFirst.mockResolvedValue(ADMIN_ROLE);
    mockFeaturesFindFirst.mockResolvedValue(PROTECTED_FEATURE);

    const result = await grantOrRevokeRoleFeature({
      roleId: ROLE_ID,
      featureKey: PROTECTED_FEATURE.key,
      granted: false,
    });

    expect(result).toEqual({
      ok: false,
      error:
        "admin.roles cannot be removed from Admin's own admin role — it would lock out every admin.",
    });
    expect(mockDeleteWhere).not.toHaveBeenCalled();
    expect(mockBumpRolesVersionForRole).not.toHaveBeenCalled();
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.role_feature.protected_blocked",
        resourceId: ROLE_ID,
        metadata: { featureKey: PROTECTED_FEATURE.key, roleName: "admin" },
      }),
    );
  });

  it("blocks revoking ADMIN_USERS from admin", async () => {
    mockRolesFindFirst.mockResolvedValue(ADMIN_ROLE);
    mockFeaturesFindFirst.mockResolvedValue({ key: "admin.users", name: "Manage users" });

    const result = await grantOrRevokeRoleFeature({
      roleId: ROLE_ID,
      featureKey: "admin.users",
      granted: false,
    });

    expect(result.ok).toBe(false);
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  it("does NOT block GRANTING a protected key to admin (revoke-only)", async () => {
    mockRolesFindFirst.mockResolvedValue(ADMIN_ROLE);
    mockFeaturesFindFirst.mockResolvedValue(PROTECTED_FEATURE);
    mockReturningInsert.mockResolvedValue([{ id: "new-row" }]);

    const result = await grantOrRevokeRoleFeature({
      roleId: ROLE_ID,
      featureKey: PROTECTED_FEATURE.key,
      granted: true,
    });

    expect(result).toEqual({ ok: true });
    expect(mockInsertValues).toHaveBeenCalled();
  });

  it("does NOT block revoking a NON-protected key from admin", async () => {
    mockRolesFindFirst.mockResolvedValue(ADMIN_ROLE);
    mockFeaturesFindFirst.mockResolvedValue(FEATURE); // admin.audit — not in the floor
    mockReturningDelete.mockResolvedValue([{ id: "gone-row" }]);

    const result = await grantOrRevokeRoleFeature({
      roleId: ROLE_ID,
      featureKey: FEATURE.key,
      granted: false,
    });

    expect(result).toEqual({ ok: true });
    expect(mockDeleteWhere).toHaveBeenCalled();
  });

  it("does NOT block revoking a protected key from a NON-admin role", async () => {
    mockRolesFindFirst.mockResolvedValue(ORDINARY_ROLE); // billing_editor
    mockFeaturesFindFirst.mockResolvedValue(PROTECTED_FEATURE);
    mockReturningDelete.mockResolvedValue([{ id: "gone-row" }]);

    const result = await grantOrRevokeRoleFeature({
      roleId: ROLE_ID,
      featureKey: PROTECTED_FEATURE.key,
      granted: false,
    });

    expect(result).toEqual({ ok: true });
    expect(mockDeleteWhere).toHaveBeenCalled();
  });
});
