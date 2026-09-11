"use server";
import "server-only";

import { eq } from "drizzle-orm";
import {
  validateFileTicketInput,
  validateTicketReply,
} from "@repo/db";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { FEATURES, hasFeature } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  notifyOperatorsOfNewTicket,
  notifyOperatorsOfSubmitterReply,
} from "@/lib/tickets-notifications";
import type { ActionResult } from "@/types/actions";

/**
 * Submitter-side helpdesk actions. Authorization boundary: auth() +
 * hasFeature(TICKETS_FILE) here, plus an OWNERSHIP predicate on every
 * ticket-scoped mutation — a submitter can only ever touch their own
 * tickets, enforced by the WHERE clause, never by trusting the id.
 */

export async function fileTicketAction(input: {
  subject: string;
  body: string;
  changeClass: string;
  area: string;
  priority: string;
}): Promise<ActionResult<{ ticketId: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  if (!hasFeature(session.user.features, FEATURES.TICKETS_FILE)) {
    return { ok: false, error: "Forbidden." };
  }

  const limited = await checkRateLimit(
    `ticket-file:${session.user.id}`,
    { max: 10, windowSeconds: 3600 },
    { userId: session.user.id, actor: "member", reason: "ticket filing flood control" },
  );
  if (!limited.allowed) {
    return { ok: false, error: "Too many tickets filed — try again later." };
  }

  const valid = validateFileTicketInput(input);
  if (valid.kind === "invalid_input") {
    return { ok: false, error: valid.errors.join(" ") };
  }

  const subject = input.subject.trim();
  const [ticket] = await db
    .insert(schema.tickets)
    .values({
      submitterUserId: session.user.id,
      subject,
      changeClass: input.changeClass,
      area: input.area,
      priority: input.priority,
    })
    .returning({ id: schema.tickets.id });

  await db.insert(schema.ticketMessages).values({
    ticketId: ticket.id,
    authorKind: "submitter",
    authorUserId: session.user.id,
    body: input.body.trim(),
  });
  await db.insert(schema.ticketActions).values({
    ticketId: ticket.id,
    action: "created",
  });

  await recordAudit({
    action: AUDIT_ACTIONS.TICKET_FILED,
    resourceType: "ticket",
    resourceId: ticket.id,
    metadata: { area: input.area, changeClass: input.changeClass },
  });

  await notifyOperatorsOfNewTicket({
    ticketId: ticket.id,
    subject,
    submitterName: session.user.name ?? "A member",
  });

  return { ok: true, data: { ticketId: ticket.id } };
}

export async function replyToTicketAction(
  ticketId: string,
  body: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  if (!hasFeature(session.user.features, FEATURES.TICKETS_FILE)) {
    return { ok: false, error: "Forbidden." };
  }

  const valid = validateTicketReply(body);
  if (valid.kind === "invalid_input") {
    return { ok: false, error: valid.errors.join(" ") };
  }

  // Ownership predicate: the ticket must be the caller's own. Returning
  // "not found" (not "forbidden") for someone else's ticket id keeps the
  // two cases indistinguishable — no ticket-id oracle.
  const ticket = await db.query.tickets.findFirst({
    where: eq(schema.tickets.id, ticketId),
    columns: { id: true, subject: true, submitterUserId: true, status: true },
  });
  if (!ticket || ticket.submitterUserId !== session.user.id) {
    return { ok: false, error: "Ticket not found." };
  }

  // audit-exempt: a submitter replying on their own thread is ordinary content authoring, not a security-sensitive mutation
  await db.insert(schema.ticketMessages).values({
    ticketId,
    authorKind: "submitter",
    authorUserId: session.user.id,
    body: body.trim(),
  });

  await notifyOperatorsOfSubmitterReply({
    ticketId,
    subject: ticket.subject,
    submitterName: session.user.name ?? "A member",
  });

  return { ok: true };
}
