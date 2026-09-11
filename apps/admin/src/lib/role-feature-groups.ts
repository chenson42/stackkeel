import type { RoleMatrixApp, RoleMatrixLevel } from "@repo/ui";

/**
 * Groups the shared `features` catalog into the labeled sections the new
 * /roles page renders — one RoleMatrix instance per (app tab x category)
 * group, features as rows, roles as columns. Origin: 2026-09-09-roles-
 * permissions-ux Phase 3 § 1 ("Composition — stacked sections, not top
 * tabs"), code sample ported here verbatim per that phase's own scope
 * note ("do not design the category taxonomy afresh").
 *
 * `features.category` values (packages/permissions/src/index.ts's
 * `FEATURE_CATALOG`, confirmed live on local dev by database-admin's Phase
 * 4 slice — see that pass's "Before/after row accounting"): shared_admin,
 * portal_admin, portal_tasks, admin, a predecessor app. shared_admin is the
 * one category that renders under BOTH the a predecessor app and Portal tabs —
 * admin.users/admin.release_notes are genuinely cross-app, held by
 * billing_admin as well as Portal's own admin role (Phase 1 § B).
 */
// The kit catalog's categories (packages/permissions FEATURE_CATALOG):
// "admin" and "portal". Every category renders under the single "platform"
// section; forks extend both maps as their catalog grows.
const CATEGORY_TAB_MAP: Record<string, ReadonlyArray<"platform">> = {
  admin: ["platform"],
  portal: ["platform"],
};

const CATEGORY_LABELS: Record<string, string> = {
  admin: "Admin",
  portal: "Portal",
};

export interface RoleFeatureGroup {
  categoryKey: string;
  categoryLabel: string;
  /** One "app" (row) per feature in this category; `levels` is this
   *  tab's own role columns, IDENTICAL across every row in the group —
   *  RoleMatrix's own column-dedup-by-label logic degenerates to a no-op
   *  here (Phase 2 § 1 / Phase 3 § 1, both confirmed by reading
   *  role-matrix.tsx directly, not inherited). */
  matrixApps: RoleMatrixApp[];
}

/**
 * Builds the category groups for one app tab. `tabRoles` is that tab's own
 * role columns — reuse `buildRoleMatrixApps()`'s existing per-namespace
 * `.levels` array verbatim (role-groups.ts), unchanged, per Phase 3 § 1
 * ("The apps/roleTabs half... is buildRoleMatrixApps() reused verbatim").
 */
export function buildRoleFeatureGroups(
  tabId: "platform",
  tabRoles: RoleMatrixLevel[],
  featuresByCategory: Record<string, { key: string; name: string }[]>,
): RoleFeatureGroup[] {
  return Object.entries(CATEGORY_TAB_MAP)
    .filter(([, tabs]) => tabs.includes(tabId))
    .map(([categoryKey]) => ({
      categoryKey,
      categoryLabel: CATEGORY_LABELS[categoryKey] ?? categoryKey,
      matrixApps: (featuresByCategory[categoryKey] ?? []).map((f) => ({
        id: f.key,
        label: f.name,
        levels: tabRoles,
      })),
    }))
    .filter((g) => g.matrixApps.length > 0);
}
