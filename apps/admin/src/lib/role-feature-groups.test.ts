import { describe, expect, it } from "vitest";
import { buildRoleFeatureGroups } from "./role-feature-groups";
import type { RoleMatrixLevel } from "@repo/ui";

const ROLES: RoleMatrixLevel[] = [
  { id: "role-admin", label: "Administrator" },
  { id: "role-member", label: "Member" },
];

const FEATURES_BY_CATEGORY = {
  admin: [
    { key: "admin.users", name: "Manage users" },
    { key: "admin.release_notes", name: "Read release notes" },
  ],
  portal: [{ key: "tickets.file", name: "File support tickets" }],
};

describe("buildRoleFeatureGroups", () => {
  it("renders both kit categories under the platform section, features as rows", () => {
    const groups = buildRoleFeatureGroups("platform", ROLES, FEATURES_BY_CATEGORY);
    expect(groups.map((g) => g.categoryKey)).toEqual(["admin", "portal"]);
    expect(groups[0].matrixApps.map((a) => a.id)).toEqual([
      "admin.users",
      "admin.release_notes",
    ]);
    // every feature row carries the same role columns
    for (const g of groups) {
      for (const row of g.matrixApps) {
        expect(row.levels).toEqual(ROLES);
      }
    }
  });

  it("drops a category with zero features rather than rendering an empty group", () => {
    const groups = buildRoleFeatureGroups("platform", ROLES, {
      admin: FEATURES_BY_CATEGORY.admin,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].categoryKey).toBe("admin");
  });

  it("an unknown category (a fork's new one, not yet mapped) is not silently rendered", () => {
    const groups = buildRoleFeatureGroups("platform", ROLES, {
      mystery: [{ key: "x.y", name: "X" }],
    });
    expect(groups).toHaveLength(0);
  });
});
