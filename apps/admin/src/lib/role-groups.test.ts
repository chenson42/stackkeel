import { describe, expect, it } from "vitest";
import { buildRoleMatrixApps, emptyCellsFor } from "./role-groups";

const ALL_ROLES = [
  { id: "r1", name: "admin", displayName: "Administrator", sortOrder: 10 },
  { id: "r2", name: "member", displayName: "Member", sortOrder: 20 },
];

describe("buildRoleMatrixApps", () => {
  it("returns one flat platform group with every role as a column, sorted by sortOrder", () => {
    const apps = buildRoleMatrixApps(ALL_ROLES);
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe("platform");
    expect(apps[0].levels.map((l) => l.label)).toEqual(["Administrator", "Member"]);
  });

  it("returns no groups for an empty roles table", () => {
    expect(buildRoleMatrixApps([])).toEqual([]);
  });
});

describe("emptyCellsFor", () => {
  it("builds an all-false cell map keyed (groupId, roleId)", () => {
    const cells = emptyCellsFor(buildRoleMatrixApps(ALL_ROLES));
    expect(cells).toEqual({ platform: { r1: false, r2: false } });
  });
});
