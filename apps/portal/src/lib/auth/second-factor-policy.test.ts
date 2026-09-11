import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeSecondFactorPolicy } from "./second-factor-policy";
import { computeSharedJwtClaims } from "@repo/auth/jwt";
import { FEATURES } from "@/lib/permissions";

// Mocking computeSharedJwtClaims (the DB round-trip) rather than a real db —
// this file proves computeSecondFactorPolicy's OWN composition logic
// (isAdminIsh || hasTotp, and the deliberate exclusion of
// claims.twoFactorRequired), not computeSharedJwtClaims' own query, which
// has its own test coverage in packages/auth. Mocking the narrow
// "@repo/auth/jwt" subpath (not the "@repo/auth" barrel, which is
// unimportable under Vitest — see second-factor-policy.ts's own import
// comment) — this subpath has no next-auth dependency to worry about.
vi.mock("@repo/auth/jwt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/auth/jwt")>();
  return {
    ...actual,
    computeSharedJwtClaims: vi.fn(),
  };
});

const mockedComputeSharedJwtClaims = vi.mocked(computeSharedJwtClaims);

// A minimal stub — computeSecondFactorPolicy passes `db` straight through
// to computeSharedJwtClaims (mocked above), never touching it directly.
const stubDb = {} as Parameters<typeof computeSecondFactorPolicy>[0];

function claims(overrides: {
  features?: string[];
  hasTotp?: boolean;
  twoFactorRequired?: boolean;
}) {
  return {
    isActive: true,
    twoFactorRequired: overrides.twoFactorRequired ?? true,
    email: "user@example.com",
    globalRole: null,
    canCreateProjectsOverride: false,
    mustChangePassword: false,
    hasTotp: overrides.hasTotp ?? false,
    // Revocation-freshness stamp (DECISION-023) — not exercised by this
    // file's own assertions (computeSecondFactorPolicy never reads it), but
    // required by SharedJwtClaims' shape so this mock stays a real subtype.
    rolesVersion: 0,
    roles: [],
    features: overrides.features ?? [],
  };
}

describe("computeSecondFactorPolicy — Chris's 2026-09-08 ruling, four-row table", () => {
  beforeEach(() => {
    mockedComputeSharedJwtClaims.mockReset();
  });

  it("row 1: admin-ish + enrolled → owesSecondFactor true, hasTotp true", async () => {
    mockedComputeSharedJwtClaims.mockResolvedValue(
      claims({ features: [FEATURES.ADMIN_DASHBOARD], hasTotp: true }),
    );
    const policy = await computeSecondFactorPolicy(stubDb, "user-1");
    expect(policy).toEqual({ owesSecondFactor: true, hasTotp: true });
  });

  it("row 2: admin-ish + NOT enrolled → owesSecondFactor true, hasTotp false", async () => {
    mockedComputeSharedJwtClaims.mockResolvedValue(
      claims({ features: [FEATURES.ADMIN_DASHBOARD], hasTotp: false }),
    );
    const policy = await computeSecondFactorPolicy(stubDb, "user-2");
    expect(policy).toEqual({ owesSecondFactor: true, hasTotp: false });
  });

  it("row 3: ordinary member + enrolled → owesSecondFactor true (via hasTotp, not role), hasTotp true", async () => {
    mockedComputeSharedJwtClaims.mockResolvedValue(
      claims({ features: [], hasTotp: true }),
    );
    const policy = await computeSecondFactorPolicy(stubDb, "user-3");
    expect(policy).toEqual({ owesSecondFactor: true, hasTotp: true });
  });

  it("row 4: ordinary member + NOT enrolled → owesSecondFactor false (the trap-avoidance row)", async () => {
    // twoFactorRequired: true is the users.twoFactorRequired column's real
    // DB default (packages/db/src/schema/identity.ts:52,
    // .notNull().default(true)) for every row, INCLUDING a never-enrolled
    // ordinary volunteer. This is the literal case Phase 2 § 6 named as the
    // landmine: reusing that column here would force owesSecondFactor=true
    // for this exact row, the inverse of Chris's ruling. Asserted with it
    // explicitly set true so a regression that starts reading
    // claims.twoFactorRequired fails this test, not just a prose review.
    mockedComputeSharedJwtClaims.mockResolvedValue(
      claims({ features: [], hasTotp: false, twoFactorRequired: true }),
    );
    const policy = await computeSecondFactorPolicy(stubDb, "user-4");
    expect(policy).toEqual({ owesSecondFactor: false, hasTotp: false });
  });

  it("returns owesSecondFactor:false, hasTotp:false when the user row is gone/deactivated", async () => {
    mockedComputeSharedJwtClaims.mockResolvedValue(null);
    const policy = await computeSecondFactorPolicy(stubDb, "user-5");
    expect(policy).toEqual({ owesSecondFactor: false, hasTotp: false });
  });

  it("passes featureKeys/refreshRoles through to computeSharedJwtClaims", async () => {
    mockedComputeSharedJwtClaims.mockResolvedValue(claims({}));
    await computeSecondFactorPolicy(stubDb, "user-6");
    expect(mockedComputeSharedJwtClaims).toHaveBeenCalledWith(
      stubDb,
      "user-6",
      expect.objectContaining({ refreshRoles: true }),
    );
  });
});
