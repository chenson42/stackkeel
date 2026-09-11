import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, FormattedDate } from "@repo/ui";
import { listEmailQueue } from "@repo/db";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { FEATURES, hasFeature } from "@repo/permissions";

// Cross-app email queue viewer (2026-09-05-admin-menu-structure).
//
// Read-only this increment — matches the "viewer" framing in
// apps/portal/docs/work-log/2026-09-05-shared-platform-services.md. A
// retry/cancel action is a separate, later increment once this shape proves
// right; Portal's own /admin/email-queue already has a retry action and
// keeps it — this page does not duplicate that mutation surface.
//
// The queue is shared across all three apps (packages/db/src/email-queue.ts),
// so — unlike Portal's own viewer, which only ever sees its own traffic —
// this page shows the originating `app` column AND lets an operator filter
// by it. Gated on its own ADMIN_EMAIL_QUEUE feature rather than reusing
// ADMIN_AUDIT: viewing the mail queue is a materially different privilege
// from reading the audit trail.

const APPS = ["all", "portal", "admin"] as const;
const STATUSES = ["all", "queued", "processing", "sent", "failed"] as const;
const LIMIT = 50;

const APP_LABELS: Record<string, string> = {
  portal: "Portal",
  admin: "ADMIN",
};

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-200",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  sent: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function isValid<T extends readonly string[]>(list: T, value: string | undefined): value is T[number] {
  return !!value && (list as readonly string[]).includes(value);
}

function buildLink(params: { app: string; status: string; cursor?: string }) {
  const sp = new URLSearchParams();
  if (params.app !== "all") sp.set("app", params.app);
  if (params.status !== "all") sp.set("status", params.status);
  if (params.cursor) sp.set("cursor", params.cursor);
  const qs = sp.toString();
  return qs ? `/email-queue?${qs}` : "/email-queue";
}

export default async function EmailQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string; status?: string; cursor?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_EMAIL_QUEUE)) {
    redirect("/access-pending");
  }

  const sp = await searchParams;
  const currentApp = isValid(APPS, sp.app) ? sp.app : "all";
  const currentStatus = isValid(STATUSES, sp.status) ? sp.status : "all";

  const { rows, nextCursor } = await listEmailQueue(db, {
    app: currentApp === "all" ? undefined : currentApp,
    status: currentStatus === "all" ? undefined : currentStatus,
    cursor: sp.cursor,
    limit: LIMIT,
  });

  return (
    <>
      <PageHeader
        title="Email queue"
        description="Outbound email across every app — read-only."
        count={rows.length}
        countLabel="rows shown"
      />

      <div className="mt-6 flex flex-wrap items-center gap-4 border-b border-border pb-3">
        <div className="flex flex-wrap gap-2">
          {APPS.map((a) => (
            <Link
              key={a}
              href={buildLink({ app: a, status: currentStatus })}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                currentApp === a
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {a === "all" ? "All apps" : (APP_LABELS[a] ?? a)}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={buildLink({ app: currentApp, status: s })}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                currentStatus === s
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">No emails match this filter.</p>
          <Link
            href="/email-queue"
            className="mt-2 block text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Status</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">App</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Recipient</th>
                <th className="pb-2 pr-4 font-medium">Subject</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Template</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Attempts</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Queued at</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Sent at</th>
                <th className="pb-2 font-medium">Failure reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-xs whitespace-nowrap">
                    {APP_LABELS[row.app] ?? row.app}
                  </td>
                  <td className="py-3 pr-4 text-xs whitespace-nowrap">{row.toEmail}</td>
                  <td className="py-3 pr-4 max-w-[200px]">
                    <span className="block truncate text-xs" title={row.subject}>
                      {row.subject}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">
                    {row.templateKey}
                  </td>
                  <td className="py-3 pr-4 text-xs whitespace-nowrap">
                    {row.attemptCount} / {row.maxAttempts}
                  </td>
                  <td className="py-3 pr-4 text-xs whitespace-nowrap text-muted-foreground">
                    <FormattedDate value={row.createdAt} mode="datetime" />
                  </td>
                  <td className="py-3 pr-4 text-xs whitespace-nowrap text-muted-foreground">
                    {row.sentAt ? <FormattedDate value={row.sentAt} mode="datetime" /> : "—"}
                  </td>
                  <td className="py-3">
                    {row.failureReason ? (
                      <span
                        className="block max-w-[200px] truncate text-xs text-muted-foreground"
                        title={row.failureReason}
                      >
                        {row.failureReason}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <div className="mt-4">
          <Link
            href={buildLink({ app: currentApp, status: currentStatus, cursor: nextCursor })}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Load more →
          </Link>
        </div>
      )}
    </>
  );
}
