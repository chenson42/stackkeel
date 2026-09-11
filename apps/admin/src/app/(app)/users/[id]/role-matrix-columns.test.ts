import { describe, it, expect } from "vitest";
import type { RoleMatrixApp, RoleMatrixLevel } from "@repo/ui";

/**
 * Column derivation for `packages/ui`'s RoleMatrix.
 *
 * Regression for 2026-09-06, reported by Chris as "why 3 admin roles?" — the
 * grid rendered THREE separate columns all headed "Admin", one per app, each
 * holding a single toggle and two dashes.
 *
 * Cause: columns were deduplicated by level `id`, but level ids are per-app
 * role names (`billing_admin`, `portal_admin`, `admin`) and so
 * are always distinct — nothing ever collapsed. Deduplicating by `label` is
 * what makes shared tiers share a column, which is the grid the component's
 * own header comment describes.
 *
 * WHY THIS TEST LIVES IN apps/admin RATHER THAN packages/ui: `@repo/ui` has no
 * test runner at all (no `test` script, no vitest config) — a spec placed
 * beside the component would never execute, which is worse than no spec. Admin
 * is the only consumer of RoleMatrix, and its suite runs. If `packages/ui`
 * ever gains a test setup, this belongs there.
 *
 * The derivation is reproduced rather than imported because RoleMatrix is a
 * client component with JSX and this suite has no DOM environment. The loop
 * below mirrors the one in role-matrix.tsx.
 */
function deriveColumns(apps: RoleMatrixApp[]): RoleMatrixLevel[] {
  const cols: RoleMatrixLevel[] = [];
  const seen = new Set<string>();
  for (const app of apps) {
    for (const level of app.levels) {
      if (!seen.has(level.label)) {
        seen.add(level.label);
        cols.push(level);
      }
    }
  }
  return cols;
}

/** The real three-app shape, with the real per-app role-name ids. */
const APPS: RoleMatrixApp[] = [
  {
    id: "billing",
    label: "billing",
    levels: [
      { id: "billing_admin", label: "Admin" },
      { id: "billing_editor", label: "Write" },
      { id: "billing_reader", label: "Read" },
    ],
  },
  {
    id: "portal",
    label: "Portal",
    levels: [
      { id: "portal_admin", label: "Admin" },
      { id: "portal_member", label: "Member" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    levels: [{ id: "admin", label: "Admin" }],
  },
];

describe("RoleMatrix column derivation", () => {
  it("renders exactly one column per distinct tier LABEL", () => {
    expect(deriveColumns(APPS).map((c) => c.label)).toEqual([
      "Admin",
      "Write",
      "Read",
      "Member",
    ]);
  });

  it("does not repeat 'Admin' once per app — the reported bug", () => {
    const labels = deriveColumns(APPS).map((c) => c.label);
    expect(labels.filter((l) => l === "Admin")).toHaveLength(1);
  });

  it("produces 4 columns from 6 distinct level ids", () => {
    const distinctIds = new Set(APPS.flatMap((a) => a.levels.map((l) => l.id)));
    expect(distinctIds.size).toBe(6);
    expect(deriveColumns(APPS)).toHaveLength(4);
  });

  it("resolves each app's OWN level id for a shared column", () => {
    // This is what keeps `cells` and `onToggle` correct after the collapse:
    // the column is shared, the id handed to the caller stays per-app.
    const adminColumn = deriveColumns(APPS)[0];
    for (const [appId, expectedId] of [
      ["billing", "billing_admin"],
      ["portal", "portal_admin"],
      ["admin", "admin"],
    ] as const) {
      const app = APPS.find((a) => a.id === appId)!;
      expect(app.levels.find((l) => l.label === adminColumn.label)?.id).toBe(expectedId);
    }
  });

  it("leaves an app without a tier unmatched, so it renders a dash", () => {
    const writeColumn = deriveColumns(APPS).find((c) => c.label === "Write")!;
    const portal = APPS.find((a) => a.id === "portal")!;
    expect(portal.levels.find((l) => l.label === writeColumn.label)).toBeUndefined();
  });

  it("handles a single-app matrix without inventing columns", () => {
    expect(deriveColumns([APPS[2]]).map((c) => c.label)).toEqual(["Admin"]);
  });

  it("returns no columns for no apps", () => {
    expect(deriveColumns([])).toEqual([]);
  });
});
