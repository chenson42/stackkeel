import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { roles, features, roleFeatures } from "@/lib/db/schema";
import { ADMIN_PROTECTED_FEATURES, ADMIN_ROLE, FEATURES, hasFeature } from "@repo/permissions";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  PageHeader,
  type RoleMatrixCells,
} from "@repo/ui";
import { buildRoleMatrixApps } from "@/lib/role-groups";
import { buildRoleFeatureGroups, type RoleFeatureGroup } from "@/lib/role-feature-groups";
import { RoleFeatureMatrix } from "./role-feature-matrix";

// /roles — role x feature ("what does this role grant") editing.
// 2026-09-09-roles-permissions-ux Phase 3 § 1/§ 8. Distinct from
// /users/[id]'s RoleMatrix, which edits WHO holds a role (user_roles) —
// this page edits WHAT a role grants (role_features): features are rows,
// roles are columns, one RoleMatrix instance per (app tab x category)
// group, stacked in three <section>s (a predecessor app / Portal / ADMIN) rather
// than top tabs (Phase 3 § 1 — no Tabs primitive exists in packages/ui,
// and three groups don't justify adding one).
const TAB_IDS = ["platform"] as const;

const TAB_LABELS: Record<(typeof TAB_IDS)[number], string> = { platform: "Roles" };

// Anti-lockout floor (ADMIN_PROTECTED_FEATURES, @repo/permissions):
// rendered here as permanently-disabled cells, not just enforced
// server-side (role-grant.ts), so the "why" the UI shows before a click
// and the "why" the server would give after one never disagree.
const PROTECTED_FLOOR_KEYS: readonly string[] = ADMIN_PROTECTED_FEATURES;
function protectedFloorReason(featureKey: string): string {
  return `${featureKey} cannot be removed from the admin role — it would lock out every admin.`;
}

export default async function RolesPage() {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_ROLES)) {
    redirect("/access-pending");
  }

  const [allRoles, allFeatures, grants] = await Promise.all([
    db
      .select({ id: roles.id, name: roles.name, displayName: roles.displayName, sortOrder: roles.sortOrder })
      .from(roles)
      .orderBy(roles.sortOrder),
    db
      .select({ key: features.key, name: features.name, category: features.category })
      .from(features)
      .orderBy(features.category, features.name),
    db.select({ roleId: roleFeatures.roleId, featureKey: roleFeatures.featureKey }).from(roleFeatures),
  ]);

  const featuresByCategory: Record<string, { key: string; name: string }[]> = {};
  for (const f of allFeatures) {
    (featuresByCategory[f.category] ??= []).push({ key: f.key, name: f.name });
  }

  const grantedSet = new Set(grants.map((g) => `${g.roleId}:${g.featureKey}`));
  const matrixApps = buildRoleMatrixApps(allRoles);
  const adminRole = allRoles.find((r) => r.name === ADMIN_ROLE);

  function cellsFor(group: RoleFeatureGroup): RoleMatrixCells {
    const cells: RoleMatrixCells = {};
    for (const featureRow of group.matrixApps) {
      cells[featureRow.id] = {};
      for (const level of featureRow.levels) {
        cells[featureRow.id][level.id] = grantedSet.has(`${level.id}:${featureRow.id}`);
      }
    }
    return cells;
  }

  function disabledCellsFor(
    tabId: (typeof TAB_IDS)[number],
    group: RoleFeatureGroup,
  ): Record<string, string> | undefined {
    if (tabId !== "platform" || !adminRole) return undefined;
    const entries: Record<string, string> = {};
    for (const featureRow of group.matrixApps) {
      if (PROTECTED_FLOOR_KEYS.includes(featureRow.id)) {
        entries[`${featureRow.id}:${adminRole.id}`] = protectedFloorReason(featureRow.id);
      }
    }
    return Object.keys(entries).length > 0 ? entries : undefined;
  }

  const sections = TAB_IDS.map((tabId) => {
    const matrixApp = matrixApps.find((a) => a.id === "platform");
    if (!matrixApp) return null;
    const groups = buildRoleFeatureGroups(tabId, matrixApp.levels, featuresByCategory);
    if (groups.length === 0) return null;
    return { tabId, label: TAB_LABELS[tabId], groups };
  }).filter((s) => s != null);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Roles"
        description="Edit which permissions each role grants. One row per permission, one column per role that app supports."
        count={allFeatures.length}
        countLabel="permissions"
      />

      {/* Phase 3 § 7 — a static, always-visible warning (never inside
          PageHeader's description, which is hidden below sm). Per-toggle-
          immediate is the interaction model here (§ 2), so this is the one
          shared notice rather than a per-cell or per-toggle confirmation. */}
      <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
        Changes here take effect for every user holding the affected role, in every app, on their
        next request.
      </p>

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No role namespaces are seeded yet — run this app&apos;s seed script first.
        </p>
      ) : (
        sections.map((section) => (
          <section key={section.tabId} className="space-y-4">
            <h2 className="text-lg font-semibold">{section.label}</h2>
            {section.groups.map((group) => (
              <Card key={`${section.tabId}:${group.categoryKey}`}>
                <CardHeader>
                  <CardTitle className="text-base">{group.categoryLabel}</CardTitle>
                </CardHeader>
                <CardContent>
                  <RoleFeatureMatrix
                    matrixApps={group.matrixApps}
                    initialCells={cellsFor(group)}
                    disabledCells={disabledCellsFor(section.tabId, group)}
                  />
                </CardContent>
              </Card>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
