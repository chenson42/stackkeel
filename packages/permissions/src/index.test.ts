import { describe, it, expect } from "vitest";
import {
  ADMIN_ROLE,
  MEMBER_ROLE,
  ADMIN_PROTECTED_FEATURES,
  MEMBER_DEFAULT_FEATURES,
  FEATURES,
  FEATURE_CATALOG,
  hasFeature,
  hasRoleInApp,
  isKnownRoleName,
  KNOWN_ROLE_NAMES,
} from "./index";

describe("FEATURE_CATALOG", () => {
  it("covers every FEATURES key exactly once", () => {
    const catalogKeys = FEATURE_CATALOG.map((f) => f.key);
    const featureValues = Object.values(FEATURES);
    expect(new Set(catalogKeys).size).toBe(catalogKeys.length);
    expect([...catalogKeys].sort()).toEqual([...featureValues].sort());
  });

  it("gives every entry a non-empty name, description, and category", () => {
    for (const f of FEATURE_CATALOG) {
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
      expect(f.category.length).toBeGreaterThan(0);
    }
  });
});

describe("ADMIN_PROTECTED_FEATURES", () => {
  it("is a subset of the catalog", () => {
    const catalogKeys = new Set(FEATURE_CATALOG.map((f) => f.key));
    for (const key of ADMIN_PROTECTED_FEATURES) {
      expect(catalogKeys.has(key)).toBe(true);
    }
  });

  it("includes the roles editor itself (the lockout-critical page)", () => {
    expect(ADMIN_PROTECTED_FEATURES).toContain(FEATURES.ADMIN_ROLES);
  });
});

describe("MEMBER_DEFAULT_FEATURES", () => {
  it("is a subset of the catalog and contains no admin.* keys", () => {
    const catalogKeys = new Set(FEATURE_CATALOG.map((f) => f.key));
    for (const key of MEMBER_DEFAULT_FEATURES) {
      expect(catalogKeys.has(key)).toBe(true);
      expect(key.startsWith("admin.")).toBe(false);
    }
  });
});

describe("hasFeature", () => {
  it("returns true only when the key is present", () => {
    expect(hasFeature([FEATURES.ADMIN_USERS], FEATURES.ADMIN_USERS)).toBe(true);
    expect(hasFeature([FEATURES.ADMIN_USERS], FEATURES.ADMIN_ROLES)).toBe(false);
  });

  it("fails closed on undefined and non-array input", () => {
    expect(hasFeature(undefined, FEATURES.ADMIN_USERS)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(hasFeature("admin.users" as any, FEATURES.ADMIN_USERS)).toBe(false);
  });
});

describe("role namespaces", () => {
  it("recognizes the seeded roles and rejects unknown names", () => {
    expect(isKnownRoleName(ADMIN_ROLE)).toBe(true);
    expect(isKnownRoleName(MEMBER_ROLE)).toBe(true);
    expect(isKnownRoleName("superuser")).toBe(false);
    expect(KNOWN_ROLE_NAMES).toContain(ADMIN_ROLE);
  });

  it("hasRoleInApp fails closed", () => {
    expect(hasRoleInApp(undefined, "admin")).toBe(false);
    expect(hasRoleInApp([], "admin")).toBe(false);
    expect(hasRoleInApp(["typo_role"], "admin")).toBe(false);
  });

  it("members see portal but not admin; admins see both", () => {
    expect(hasRoleInApp([MEMBER_ROLE], "portal")).toBe(true);
    expect(hasRoleInApp([MEMBER_ROLE], "admin")).toBe(false);
    expect(hasRoleInApp([ADMIN_ROLE], "portal")).toBe(true);
    expect(hasRoleInApp([ADMIN_ROLE], "admin")).toBe(true);
  });
});
