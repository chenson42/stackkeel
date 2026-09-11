/**
 * Tests for setRoleFeatureAction (src/app/(app)/roles/actions.ts) — the
 * /roles page's own Server Action and the authorization boundary for the
 * role x feature grid. grantOrRevokeRoleFeature (src/lib/role-grant.ts) is
 * mocked here — its own behaviour (grant/revoke/protected-floor/audit/
 * rolesVersion bump) is covered by role-grant.role-feature.test.ts and the
 * real-Postgres role-grant.roles-version.integration.test.ts. This file's
 * own claim is narrower and specific to the action boundary: an actor
 * without FEATURES.ADMIN_ROLES is rejected BEFORE grantOrRevokeRoleFeature
 * is ever called (display-side gating is a convenience, never the
 * boundary — root CLAUDE.md), and an authorized call both delegates and
 * revalidates /roles.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

vi.mock("@repo/permissions", () => ({
  FEATURES: { ADMIN_ROLES: "admin.roles" },
  hasFeature: (features: string[] | undefined, key: string) =>
    Array.isArray(features) && features.includes(key),
}));

const mockGrantOrRevokeRoleFeature = vi.hoisted(() => vi.fn());
vi.mock("@/lib/role-grant", () => ({
  grantOrRevokeRoleFeature: (...a: unknown[]) => mockGrantOrRevokeRoleFeature(...a),
}));

import { revalidatePath } from "next/cache";
import { setRoleFeatureAction } from "./actions";

const INPUT = { roleId: "role-1", featureKey: "admin.audit", granted: true };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setRoleFeatureAction — authorization boundary", () => {
  it("returns Forbidden and never calls grantOrRevokeRoleFeature when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await setRoleFeatureAction(INPUT);

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(mockGrantOrRevokeRoleFeature).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns Forbidden and never calls grantOrRevokeRoleFeature when the session lacks ADMIN_ROLES", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", features: ["admin.users"] }, // has ADMIN_USERS, NOT ADMIN_ROLES
    });

    const result = await setRoleFeatureAction(INPUT);

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(mockGrantOrRevokeRoleFeature).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("delegates to grantOrRevokeRoleFeature and revalidates /roles when authorized", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", features: ["admin.roles"] } });
    mockGrantOrRevokeRoleFeature.mockResolvedValue({ ok: true });

    const result = await setRoleFeatureAction(INPUT);

    expect(result).toEqual({ ok: true });
    expect(mockGrantOrRevokeRoleFeature).toHaveBeenCalledWith(INPUT);
    expect(revalidatePath).toHaveBeenCalledWith("/roles");
  });

  it("propagates a rejection from grantOrRevokeRoleFeature (e.g. the protected floor) without revalidating", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", features: ["admin.roles"] } });
    mockGrantOrRevokeRoleFeature.mockResolvedValue({
      ok: false,
      error: "admin.roles cannot be removed from Admin's own admin role — it would lock out every admin.",
    });

    const result = await setRoleFeatureAction(INPUT);

    expect(result.ok).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
