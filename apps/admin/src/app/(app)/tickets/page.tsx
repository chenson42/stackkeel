import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, StatusPill, FormattedDate } from "@repo/ui";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listTickets } from "@repo/db";
import { FEATURES, hasFeature } from "@repo/permissions";
import type { TicketArea, TicketPriority, TicketStatus } from "@repo/db";
import {
  TICKET_AREAS,
  TICKET_AREA_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_VARIANT,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_VARIANT,
} from "@/lib/tickets-labels";

// Filters live in the URL (?status=&priority=&area=) so a triage view is
// shareable and survives refresh — UI-STANDARDS' filter-state convention.
export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; area?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (!hasFeature(session.user.features, FEATURES.ADMIN_TICKETS)) {
    redirect("/");
  }

  const params = await searchParams;
  const status = (TICKET_STATUSES as readonly string[]).includes(params.status ?? "")
    ? params.status
    : undefined;
  const priority = (TICKET_PRIORITIES as readonly string[]).includes(params.priority ?? "")
    ? params.priority
    : undefined;
  const area = (TICKET_AREAS as readonly string[]).includes(params.area ?? "")
    ? params.area
    : undefined;

  const { rows } = await listTickets(db, { status, priority, area, limit: 100 });

  const filterLink = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { status, priority, area, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const qs = next.toString();
    return qs ? `/tickets?${qs}` : "/tickets";
  };

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Cross-user support queue — triage, assign, and reply."
      />

      {/* Status filter pills; "All" clears. Server-rendered links, no client state. */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={filterLink({ status: undefined })}
          className={!status ? "font-semibold underline" : "text-muted-foreground hover:underline"}
        >
          All
        </Link>
        {TICKET_STATUSES.map((s) => (
          <Link
            key={s}
            href={filterLink({ status: s })}
            className={status === s ? "font-semibold underline" : "text-muted-foreground hover:underline"}
          >
            {TICKET_STATUS_LABELS[s]}
          </Link>
        ))}
        <span className="text-muted-foreground">·</span>
        {TICKET_PRIORITIES.map((p) => (
          <Link
            key={p}
            href={filterLink({ priority: priority === p ? undefined : p })}
            className={priority === p ? "font-semibold underline" : "text-muted-foreground hover:underline"}
          >
            {TICKET_PRIORITY_LABELS[p]}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No tickets match this filter.
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tickets/${t.id}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.subject}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.submitterName ?? "Unknown member"} ·{" "}
                    {TICKET_AREA_LABELS[t.area as TicketArea] ?? t.area} ·{" "}
                    <FormattedDate value={t.createdAt} mode="date" />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill variant={TICKET_PRIORITY_VARIANT[t.priority as TicketPriority] ?? "neutral"}>
                    {TICKET_PRIORITY_LABELS[t.priority as TicketPriority] ?? t.priority}
                  </StatusPill>
                  <StatusPill variant={TICKET_STATUS_VARIANT[t.status as TicketStatus] ?? "neutral"}>
                    {TICKET_STATUS_LABELS[t.status as TicketStatus] ?? t.status}
                  </StatusPill>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
