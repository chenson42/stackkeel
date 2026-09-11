import { redirect } from "next/navigation";
import { desc, eq, ilike } from "drizzle-orm";
import { PageHeader, FormattedDate, StatusPill } from "@repo/ui";
import { devices, users, platformLabel } from "@repo/db";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { FEATURES, hasFeature } from "@repo/permissions";
import { DeviceRevokeButton } from "./device-revoke-button";
import { UserFilterForm } from "./user-filter-form";

/**
 * /devices — every user's native devices (module `mobile`). Gated on
 * ADMIN_DEVICES (same key as the sidebar entry — hidden, never
 * shown-then-denied). Filter is a plain ?user= email substring, URL-state
 * like /tickets' filters.
 */
export default async function AdminDevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_DEVICES)) {
    redirect("/access-pending");
  }

  const { user: userFilter } = await searchParams;

  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      platform: devices.platform,
      appVersion: devices.appVersion,
      lastSeenAt: devices.lastSeenAt,
      revokedAt: devices.revokedAt,
      createdAt: devices.createdAt,
      ownerEmail: users.email,
      ownerName: users.name,
    })
    .from(devices)
    .innerJoin(users, eq(devices.userId, users.id))
    .where(userFilter ? ilike(users.email, `%${userFilter}%`) : undefined)
    .orderBy(desc(devices.lastSeenAt), desc(devices.createdAt))
    .limit(200);

  return (
    <>
      <PageHeader
        title="Devices"
        description="Native app installs across every account. Revoking signs the device out permanently."
        count={rows.length}
        countLabel="devices"
      />

      <UserFilterForm initial={userFilter ?? ""} />

      {rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">No devices found.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Devices appear when someone signs in through the native shell or
            pairs the mobile app.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Device</th>
                <th className="py-2 pr-4 font-medium">Owner</th>
                <th className="py-2 pr-4 font-medium">Platform</th>
                <th className="py-2 pr-4 font-medium">Last seen</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-b border-border/60">
                  <td className="py-2 pr-4">
                    {d.name ?? `${platformLabel(d.platform)} device`}
                    {d.appVersion ? (
                      <span className="text-muted-foreground"> · v{d.appVersion}</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4">
                    {d.ownerName ?? "—"}
                    <span className="block text-xs text-muted-foreground">{d.ownerEmail}</span>
                  </td>
                  <td className="py-2 pr-4">{platformLabel(d.platform)}</td>
                  <td className="py-2 pr-4">
                    {d.lastSeenAt ? <FormattedDate value={d.lastSeenAt} /> : "never"}
                  </td>
                  <td className="py-2 pr-4">
                    {d.revokedAt ? (
                      <StatusPill variant="neutral">Revoked</StatusPill>
                    ) : (
                      <StatusPill variant="active">Active</StatusPill>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {d.revokedAt === null && (
                      <DeviceRevokeButton deviceId={d.id} ownerEmail={d.ownerEmail} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
