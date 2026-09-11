import Link from "next/link";
import { PageHeader, StatusPill, FormattedDate } from "@repo/ui";
import { cachedAuth } from "@/lib/auth/cached-auth";
import { db } from "@/lib/db";
import { getTicketsByUserId } from "@repo/db";
import { FEATURES, hasFeature } from "@/lib/permissions";
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_VARIANT,
  TICKET_AREA_LABELS,
} from "@/lib/tickets-labels";
import type { TicketArea, TicketStatus } from "@repo/db";
import { FileTicketForm } from "./file-ticket-form";

// Gate: FEATURES.TICKETS_FILE — the SAME check proxy.ts's PROTECTION_RULES
// entry for /support enforces and the tile registry's isVisible mirrors.
// This page-level render is the honest denied state behind both.
export default async function SupportPage() {
  const session = await cachedAuth();
  const user = session!.user;

  if (!hasFeature(user.features, FEATURES.TICKETS_FILE)) {
    return (
      <>
        <PageHeader title="Support" />
        <p className="mt-6 text-sm text-muted-foreground">
          Your account doesn&apos;t have access to support tickets. If you think
          that&apos;s wrong, contact your administrator.
        </p>
      </>
    );
  }

  const myTickets = await getTicketsByUserId(db, user.id);

  return (
    <>
      <PageHeader
        title="Support"
        description="File a ticket and follow the conversation until it's resolved."
      />

      <div className="mt-6">
        <FileTicketForm />
      </div>

      <h2 className="mt-10 text-lg font-semibold">My tickets</h2>
      {myTickets.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No tickets yet. When you file one, it shows up here with its status.
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {myTickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/support/${t.id}?from=/support`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.subject}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {TICKET_AREA_LABELS[t.area as TicketArea] ?? t.area} ·{" "}
                    <FormattedDate value={t.createdAt} mode="date" />
                  </p>
                </div>
                <StatusPill
                  variant={TICKET_STATUS_VARIANT[t.status as TicketStatus] ?? "neutral"}
                >
                  {TICKET_STATUS_LABELS[t.status as TicketStatus] ?? t.status}
                </StatusPill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
