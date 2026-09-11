import { describe, it, expect } from "vitest";
import { ADMIN_ROLE, FEATURES, FEATURE_CATALOG, hasFeature, MEMBER_ROLE } from "./permissions";
import {
  ADMIN_ROLE as SHARED_ADMIN_ROLE,
  MEMBER_ROLE as SHARED_MEMBER_ROLE,
} from "@repo/permissions";

describe("portal permissions surface", () => {
  it("hasFeature answers membership over the user's feature list", () => {
    expect(hasFeature([FEATURES.ADMIN_USERS], FEATURES.ADMIN_USERS)).toBe(true);
    expect(hasFeature([FEATURES.ADMIN_USERS], FEATURES.ADMIN_DASHBOARD)).toBe(false);
    expect(hasFeature([], FEATURES.ADMIN_DASHBOARD)).toBe(false);
    expect(hasFeature(undefined, FEATURES.ADMIN_DASHBOARD)).toBe(false);
  });

  it("stays in lockstep with @repo/permissions (re-export, not a drifted copy)", () => {
    expect(ADMIN_ROLE).toBe(SHARED_ADMIN_ROLE);
    expect(MEMBER_ROLE).toBe(SHARED_MEMBER_ROLE);
  });

  it("every FEATURES value appears exactly once in FEATURE_CATALOG", () => {
    const catalogKeys = FEATURE_CATALOG.map((f) => f.key);
    for (const key of Object.values(FEATURES)) {
      expect(catalogKeys.filter((k) => k === key)).toHaveLength(1);
    }
  });
});
