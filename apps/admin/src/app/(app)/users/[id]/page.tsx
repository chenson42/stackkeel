import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users, roles, userRoles, inviteTokens, userTotp } from "@/lib/db/schema";
import { FEATURES, hasFeature } from "@repo/permissions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, PageHeader, StatusPill, BackLink, type RoleMatrixCells } from "@repo/ui";
import { buildRoleMatrixApps } from "@/lib/role-groups";
import { UserRoleMultiSelect } from "./user-role-multiselect";
import { ResendInviteButton } from "./resend-invite-button";
import { ResetMfaButton } from "./reset-mfa-button";

// Real /users/[id] page — replaces api-developer's placeholder. The
// RoleMatrix in a Card frame (Chris's shared-components directive: reuse
// Card/AppBadge from packages/ui, don't rebuild) is this page's core UI
// (Phase 3 Component Plan).
export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_USERS)) {
    redirect("/access-pending");
  }

  const { id } = await params;
  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) notFound();

  const [allRoles, grantedRoles, inviteToken, totpRow] = await Promise.all([
    db
      .select({ id: roles.id, name: roles.name, displayName: roles.displayName, sortOrder: roles.sortOrder })
      .from(roles)
      .orderBy(roles.sortOrder),
    db
      .select({ id: roles.id })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, id)),
    db.query.inviteTokens.findFirst({
      where: eq(inviteTokens.userId, id),
      columns: { id: true },
    }),
    // 2FA atomic-convergence Increment 3 — whether Reset MFA has anything
    // to reset. Nothing to reset for a never-enrolled user.
    db.query.userTotp.findFirst({
      where: eq(userTotp.userId, id),
      columns: { userId: true },
    }),
  ]);

  const matrixApps = buildRoleMatrixApps(allRoles);
  const grantedRoleIds = new Set(grantedRoles.map((r) => r.id));
  const cells: RoleMatrixCells = {};
  for (const app of matrixApps) {
    cells[app.id] = {};
    for (const level of app.levels) {
      cells[app.id][level.id] = grantedRoleIds.has(level.id);
    }
  }

  // Self-target guard, reflected in the UI: setRoleGrantAction already
  // rejects this server-side (unconditional, first line of the function
  // body) — this is the "don't invite the attempt" half, not the actual
  // gate. See apps/admin/src/app/(app)/users/[id]/actions.ts.
  const isSelf = session.user.id === id;

  let statusLabel: string;
  let statusIsPending = false;
  if (target.accountStatus === "active") {
    statusLabel = "Active";
  } else if (inviteToken) {
    statusLabel = "Invited via email — link sent, not yet accepted";
    statusIsPending = true;
  } else {
    statusLabel = "Invited via Google — awaiting their first Google sign-in";
    statusIsPending = true;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <BackLink href="/users" label="Back to Users" />
      <PageHeader title={target.name ?? target.email} description={target.email} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <StatusPill variant={statusIsPending ? "pending" : "active"}>
            {statusLabel}
          </StatusPill>
          {statusIsPending && inviteToken && <ResendInviteButton userId={target.id} />}
        </CardContent>
      </Card>

      {/* 2FA atomic-convergence Increment 3 (2026-09-08) — admin-mediated
          MFA reset. Only shown when there's something to reset; a
          never-enrolled user hits mandatory /setup-mfa on their own next
          sign-in regardless, so there's no action for this page to offer. */}
      {totpRow && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Two-factor authentication</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <StatusPill variant="active">Enrolled</StatusPill>
            <ResetMfaButton userId={target.id} isSelf={isSelf} />
          </CardContent>
        </Card>
      )}

      {/* Changed 2026-09-06: the matrix used to be read-only for your own row.
          You can now edit your own roles; the single remaining restriction is
          enforced server-side and surfaces as an error on the one toggle it
          applies to. The UI deliberately does NOT pre-compute "am I the last
          admin" to disable that cell — a stale client belief would either block
          a legal action or invite an illegal one, and the server is the
          authority either way. */}
      {isSelf && (
        <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
          This is your own account. You can change your own roles — except removing your
          own Admin admin role while you are the only one who holds it, which
          would leave nobody able to administer any app.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles</CardTitle>
          <CardDescription>
            One group per app. Check a role to grant it, uncheck to revoke.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {matrixApps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No role namespaces are seeded yet — run this app&apos;s seed script first.
            </p>
          ) : (
            <UserRoleMultiSelect
              targetUserId={target.id}
              apps={matrixApps}
              initialCells={cells}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
