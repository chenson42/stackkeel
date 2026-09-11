import { notFound } from "next/navigation";
import { PageHeader, StatusPill, FormattedDate, BackLink } from "@repo/ui";
import { cachedAuth } from "@/lib/auth/cached-auth";
import { db } from "@/lib/db";
import { getTicketThread } from "@repo/db";
import { FEATURES, hasFeature } from "@/lib/permissions";
import type { TicketArea, TicketStatus, ChangeClass } from "@repo/db";
import {
  CHANGE_CLASS_LABELS,
  TICKET_AREA_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_VARIANT,
} from "@/lib/tickets-labels";
import { ReplyForm } from "./reply-form";

export default async function TicketThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await cachedAuth();
  const user = session!.user;
  if (!hasFeature(user.features, FEATURES.TICKETS_FILE)) notFound();

  // Submitter scope: someone else's ticket id resolves to null — the same
  // 404 as a nonexistent id, no ticket-id oracle.
  const thread = await getTicketThread(db, id, {
    kind: "submitter",
    userId: user.id,
  });
  if (!thread) notFound();

  const { ticket, messages } = thread;
  const status = ticket.status as TicketStatus;
  const isOpen = status !== "resolved" && status !== "declined";

  return (
    <>
      <BackLink href="/support" label="Back to Support" />
      <PageHeader
        title={ticket.subject}
        description={`${CHANGE_CLASS_LABELS[ticket.changeClass as ChangeClass]} · ${TICKET_AREA_LABELS[ticket.area as TicketArea]}`}
      />
      <div className="mt-2">
        <StatusPill variant={TICKET_STATUS_VARIANT[status] ?? "neutral"}>
          {TICKET_STATUS_LABELS[status] ?? ticket.status}
        </StatusPill>
      </div>

      <ol className="mt-8 space-y-4">
        {messages.map((m) => (
          <li
            key={m.id}
            className={
              m.authorKind === "operator"
                ? "rounded-lg border border-border bg-muted p-4"
                : "rounded-lg border border-border p-4"
            }
          >
            <p className="text-xs font-medium text-muted-foreground">
              {m.authorKind === "operator"
                ? `Support${m.authorName ? ` (${m.authorName})` : ""}`
                : "You"}{" "}
              · <FormattedDate value={m.createdAt} />
            </p>
            {/* XSS invariant: body rendered as a JSX text node. */}
            <p className="mt-2 text-sm whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        {isOpen ? (
          <ReplyForm ticketId={ticket.id} />
        ) : (
          <p className="text-sm text-muted-foreground">
            This ticket is {TICKET_STATUS_LABELS[status].toLowerCase()}. File a
            new ticket if you need more help.
          </p>
        )}
      </div>
    </>
  );
}
