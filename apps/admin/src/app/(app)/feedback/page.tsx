import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, FormattedDate } from "@repo/ui";
import { listFeedback } from "@repo/db";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { FEATURES, hasFeature } from "@repo/permissions";
import { FeedbackStatusControl } from "./feedback-status-control";
// kit-module:helpdesk-begin
import { PromoteToTicketButton } from "./promote-to-ticket-button";
// kit-module:helpdesk-end

// Cross-app feedback triage viewer (Increment 6, step 6a —
// apps/portal/docs/work-log/2026-09-06-feedback-admin-triage.md). Modeled
// directly on ../email-queue/page.tsx's own app/status tab-link pattern —
// same buildLink()/isValid() shape, same read-mostly-by-default posture
// with one status-control mutation.
//
// XSS INVARIANT: All member-supplied content (body, contextPath, memberName)
// is rendered as plain JSX text nodes. No dangerouslySetInnerHTML, no
// markdown. This is a hard constraint — feedback bodies are hostile user
// content.
//
// PII CONSTRAINT: listFeedback()'s own query selects users.name only, never
// users.email — verified in packages/db/src/feedback.ts directly, not
// assumed inherited from Portal's now-deleted page (umbrella Phase 2 §5's
// own explicit warning).
//
// No audit event on this page's own read (umbrella Phase 2 §3 / root
// docs/decisions.md DECISION-014 point 2) — same posture as this app's own
// /email-queue and /audit viewers.

const APPS = ["all", "portal", "admin"] as const;
const STATUSES = ["all", "new", "triaged", "done", "declined"] as const;
const LIMIT = 50;

const APP_LABELS: Record<string, string> = {
  portal: "Portal",
  admin: "ADMIN",
};

const CATEGORY_BADGE: Record<string, { label: string; className: string }> = {
  suggestion: {
    label: "Suggestion",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  },
  bug: {
    label: "Bug",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200",
  },
  other: {
    label: "Other",
    className: "bg-muted text-muted-foreground",
  },
};

// Operator vocabulary — reused verbatim from Portal's own admin page (Phase
// 3 ruling: operators see the raw state-machine values, not the softened
// member-facing labels from Increment 5's MyFeedbackList).
const STATUS_BADGE: Record<string, string> = {
  new: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-200",
  triaged: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  done: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200",
  declined: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  triaged: "Triaged",
  done: "Delivered",
  declined: "Declined",
};

function excerpt(body: string, max = 120): string {
  return body.length > max ? body.slice(0, max) + "…" : body;
}

function isValid<T extends readonly string[]>(list: T, value: string | undefined): value is T[number] {
  return !!value && (list as readonly string[]).includes(value);
}

function buildLink(params: { app: string; status: string; cursor?: string }) {
  const sp = new URLSearchParams();
  if (params.app !== "all") sp.set("app", params.app);
  if (params.status !== "all") sp.set("status", params.status);
  if (params.cursor) sp.set("cursor", params.cursor);
  const qs = sp.toString();
  return qs ? `/feedback?${qs}` : "/feedback";
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string; status?: string; cursor?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_FEEDBACK)) {
    redirect("/access-pending");
  }
  // kit-module:helpdesk-begin
  // Promotion CREATES a ticket, so the control needs admin.tickets on top
  // of admin.feedback — the server action enforces the same split.
  const canTickets = hasFeature(session.user.features, FEATURES.ADMIN_TICKETS);
  // kit-module:helpdesk-end

  const sp = await searchParams;
  const currentApp = isValid(APPS, sp.app) ? sp.app : "all";
  const currentStatus = isValid(STATUSES, sp.status) ? sp.status : "all";

  const { rows, nextCursor } = await listFeedback(db, {
    app: currentApp === "all" ? undefined : currentApp,
    status: currentStatus === "all" ? undefined : currentStatus,
    cursor: sp.cursor,
    limit: LIMIT,
  });

  return (
    <>
      <PageHeader
        title="Feedback"
        description="Member feedback across every app. Triage by changing status."
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
              {s === "all" ? "All statuses" : (STATUS_LABELS[s] ?? s)}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">No feedback matches this filter.</p>
          <Link
            href="/feedback"
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
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Submitted</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">App</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Member</th>
                <th className="pb-2 pr-4 font-medium">Category</th>
                <th className="pb-2 pr-4 font-medium">Message</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const badge = row.category ? CATEGORY_BADGE[row.category] : null;
                const statusClass = STATUS_BADGE[row.status] ?? "bg-muted text-muted-foreground";

                return (
                  <tr key={row.id} className="align-top">
                    <td className="py-3 pr-4 text-xs whitespace-nowrap text-muted-foreground">
                      <FormattedDate value={row.createdAt} mode="datetime" />
                    </td>

                    <td className="py-3 pr-4 text-xs whitespace-nowrap">
                      {APP_LABELS[row.app] ?? row.app}
                    </td>

                    <td className="py-3 pr-4 text-xs whitespace-nowrap">
                      {/* Plain text — XSS-safe. Display name only, never email. */}
                      {row.memberName ?? "Unknown member"}
                    </td>

                    <td className="py-3 pr-4">
                      {badge ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      ) : null}
                    </td>

                    <td className="py-3 pr-4 max-w-sm">
                      {/* Excerpt — plain text node (XSS-safe) */}
                      <p className="text-sm">{excerpt(row.body)}</p>

                      {row.body.length > 120 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                            Show full message
                          </summary>
                          {/* Plain text — no dangerouslySetInnerHTML, no markdown */}
                          <p className="mt-2 text-sm whitespace-pre-wrap">{row.body}</p>
                        </details>
                      )}

                      {/* Bug context — shown only when category === 'bug' */}
                      {row.category === "bug" && (row.contextPath || row.appVersion) && (
                        <div className="mt-1 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                          {row.contextPath && <div>Page: {row.contextPath}</div>}
                          {row.appVersion && <div>Version: {row.appVersion}</div>}
                        </div>
                      )}
                    </td>

                    <td className="py-3">
                      <div className="flex flex-col gap-1.5">
                        <span
                          className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
                        >
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                        <FeedbackStatusControl feedbackId={row.id} currentStatus={row.status} />
                        {/* kit-module:helpdesk-begin */}
                        {canTickets &&
                          !row.promotedToTicketId &&
                          (row.status === "new" || row.status === "triaged") && (
                            <PromoteToTicketButton feedbackId={row.id} />
                          )}
                        {row.promotedToTicketId && (
                          <Link
                            href={`/tickets/${row.promotedToTicketId}`}
                            className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline"
                          >
                            View ticket
                          </Link>
                        )}
                        {/* kit-module:helpdesk-end */}
                      </div>
                    </td>
                  </tr>
                );
              })}
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
