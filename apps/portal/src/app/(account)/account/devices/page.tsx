import { redirect } from "next/navigation";
import { BackLink, PageHeader, StatusPill, FormattedDate } from "@repo/ui";
import { cachedAuth } from "@/lib/auth/cached-auth";
import { db } from "@/lib/db";
import { listUserDevices, platformLabel } from "@repo/db";
import { PairDeviceSection } from "./pair-device-section";
import { RevokeDeviceButton } from "./revoke-device-button";

/**
 * /account/devices — self-serve native-device management (module `mobile`).
 * Auth-only (proxy default); a user only ever sees their OWN rows
 * (listUserDevices is user-scoped, and the revoke action re-checks
 * ownership). Same full-route handoff pattern as /account/2fa.
 */
export default async function AccountDevicesPage() {
  const session = await cachedAuth();
  if (!session?.user?.id) redirect("/signin?callbackUrl=/account/devices");

  const rows = await listUserDevices(db, session.user.id);
  const active = rows.filter((d) => d.revokedAt === null);
  const revoked = rows.filter((d) => d.revokedAt !== null);

  return (
    <>
      <BackLink href="/home" label="Back to Home" />
      <PageHeader
        title="Devices"
        description="Phones and tablets signed in through the native apps. Revoking a device signs it out permanently."
      />

      <PairDeviceSection />

      <section className="mt-8 space-y-3" aria-label="Active devices">
        <h2 className="text-sm font-semibold">Active devices</h2>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active devices. Install the mobile app and pair it with a code
            above, or sign in inside the native shell.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {active.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {d.name ?? `${platformLabel(d.platform)} device`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {platformLabel(d.platform)}
                    {d.appVersion ? ` · v${d.appVersion}` : ""} · last seen{" "}
                    {d.lastSeenAt ? <FormattedDate value={d.lastSeenAt} /> : "never"}
                  </p>
                </div>
                <RevokeDeviceButton deviceId={d.id} deviceName={d.name} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {revoked.length > 0 && (
        <section className="mt-8 space-y-3" aria-label="Revoked devices">
          <h2 className="text-sm font-semibold">Revoked</h2>
          <ul className="divide-y rounded-lg border opacity-70">
            {revoked.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {d.name ?? `${platformLabel(d.platform)} device`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    revoked <FormattedDate value={d.revokedAt!} />
                  </p>
                </div>
                <StatusPill variant="neutral">Revoked</StatusPill>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
