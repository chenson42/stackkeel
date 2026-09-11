import { redirect } from "next/navigation";
import { PageHeader } from "@repo/ui";
import { auth } from "@/auth";
import { FEATURES, hasFeature } from "@repo/permissions";
import { readCrossAppAudit } from "@/lib/cross-app-audit";
import { AuditTable } from "./audit-table";
import { AuditFilters } from "./audit-filters";

// Cross-app audit viewer (2026-09-05-shared-platform-services).
//
// Before this, three apps wrote audit rows and only Portal could read them —
// a predecessor app's and Admin's trails were write-only. This reads all three
// per-app tables, which are column-for-column identical by design.
//
// Gated on its own ADMIN_AUDIT feature rather than reusing ADMIN_USERS:
// reading every app's audit trail is a materially broader privilege than
// managing users, and should be grantable separately.
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    app?: string;
    action?: string;
    actor?: string;
    resource?: string;
    since?: string;
    until?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_AUDIT)) {
    redirect("/access-pending");
  }

  const sp = await searchParams;
  const { rows, sources, missing } = await readCrossAppAudit({
    app: sp.app,
    actionPrefix: sp.action,
    actorEmail: sp.actor,
    resource: sp.resource,
    since: sp.since,
    until: sp.until,
    limit: 200,
  });

  // The 200 cap is a recency window, not a total. Saying so matters on an
  // audit page: a silently truncated list reads as "these are all the events",
  // and acting on that belief is exactly the mistake this page exists to
  // prevent.
  const atCap = rows.length === 200;

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Security-sensitive activity across every app."
        count={rows.length}
        countLabel="events"
      />

      {/* A missing source is reported rather than silently omitted —
          otherwise "no events" is indistinguishable from "not migrated". */}
      {missing.length > 0 && (
        <p className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          No audit table found for: {missing.join(", ")}. This database has not
          been migrated, so no audit activity can be shown.
        </p>
      )}

      {/* The app filter offers the COLUMN values apps write (not the
          physical sources — the kit has one shared table). Extend when a
          fork adds an app id. */}
      <AuditFilters apps={["portal", "admin"]} current={sp} />

      {atCap && (
        <p className="mt-4 text-sm text-muted-foreground">
          Showing the 200 most recent matching events. Narrow the filters — a
          date range especially — to see older activity.
        </p>
      )}

      <div className="mt-6">
        <AuditTable rows={rows} />
      </div>
    </>
  );
}
