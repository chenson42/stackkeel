import { notFound, redirect } from "next/navigation";
import { PageHeader, BackLink, FormattedDate } from "@repo/ui";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getTicketThread, getTicketOperators } from "@repo/db";
import { ADMIN_ROLE, FEATURES, hasFeature } from "@repo/permissions";
import type {
  ChangeClass,
  TicketArea,
  TicketPriority,
  TicketStatus,
} from "@repo/db";
import { TicketControls } from "./ticket-controls";
import { OperatorReplyForm } from "./operator-reply-form";

export default async function AdminTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (!hasFeature(session.user.features, FEATURES.ADMIN_TICKETS)) redirect("/");

  const { id } = await params;
  const thread = await getTicketThread(db, id, { kind: "operator" });
  if (!thread) notFound();

  const operators = await getTicketOperators(db, FEATURES.ADMIN_TICKETS, ADMIN_ROLE);

  const { ticket, messages, actions } = thread;

  return (
    <>
      <BackLink href="/tickets" label="Back to Tickets" />
      <PageHeader
        title={ticket.subject}
        description={`Filed by ${ticket.submitterName ?? "Unknown member"}`}
      />

      <div className="mt-6">
        <TicketControls
          ticketId={ticket.id}
          status={ticket.status as TicketStatus}
          changeClass={ticket.changeClass as ChangeClass}
          area={ticket.area as TicketArea}
          priority={ticket.priority as TicketPriority}
          assigneeUserId={ticket.assigneeUserId}
          operators={operators.map((o) => ({
            id: o.userId,
            label: o.name ?? o.email,
          }))}
        />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
        <div>
          <h2 className="text-lg font-semibold">Conversation</h2>
          <ol className="mt-4 space-y-4">
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
                  {m.authorKind === "operator" ? "Operator" : "Submitter"}
                  {m.authorName ? ` · ${m.authorName}` : ""} ·{" "}
                  <FormattedDate value={m.createdAt} />
                </p>
                {/* XSS invariant: body rendered as a JSX text node. */}
                <p className="mt-2 text-sm whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-6">
            <OperatorReplyForm ticketId={ticket.id} />
          </div>
        </div>

        <aside>
          <h2 className="text-sm font-semibold text-muted-foreground">Timeline</h2>
          <ol className="mt-3 space-y-2 border-l border-border pl-4 text-xs text-muted-foreground">
            {actions.map((a) => (
              <li key={a.id}>
                <span className="font-medium text-foreground">
                  {a.action.replaceAll("_", " ")}
                </span>
                {a.fromValue || a.toValue ? (
                  <>
                    {" "}
                    {a.fromValue ? `${a.fromValue} → ` : ""}
                    {a.toValue ?? ""}
                  </>
                ) : null}{" "}
                · <FormattedDate value={a.appliedAt} />
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
