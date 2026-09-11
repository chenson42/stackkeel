import type { RoleMatrixApp } from "@repo/ui";

// Groups the shared `roles` table into the column buckets RoleMatrix
// renders. DISPLAY-ONLY — a UI convenience, never the authorization
// boundary: the real fail-closed check is @repo/permissions'
// isKnownRoleName(), called inside grantOrRevokeRole() at mutation time
// regardless of what this grouping puts in front of the operator.

export function buildRoleMatrixApps(
  allRoles: { id: string; name: string; displayName: string; sortOrder: number }[],
): RoleMatrixApp[] {
  const sorted = [...allRoles].sort((a, b) => a.sortOrder - b.sortOrder);

  // The kit ships un-namespaced shared roles ("admin", "member") — one flat
  // column group. A fork that adds per-app namespaced roles (e.g.
  // "billing_editor") reintroduces prefix buckets here, keyed to its own
  // APP_ROLE_NAMESPACES additions.
  const apps: RoleMatrixApp[] = [];
  if (sorted.length > 0) {
    apps.push({
      id: "platform",
      label: "Roles",
      levels: sorted.map((r) => ({ id: r.id, label: r.displayName })),
    });
  }
  return apps;
}

export function emptyCellsFor(apps: RoleMatrixApp[]): Record<string, Record<string, boolean>> {
  const cells: Record<string, Record<string, boolean>> = {};
  for (const app of apps) {
    cells[app.id] = {};
    for (const level of app.levels) cells[app.id][level.id] = false;
  }
  return cells;
}
