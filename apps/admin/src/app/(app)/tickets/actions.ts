"use server";
import "server-only";

import { eq } from "drizzle-orm";
import {
  validateTicketTransition,
  validateTicketReply,
  validateFeedbackPromotion,
  CHANGE_CLASSES,
  TICKET_AREAS,
  TICKET_PRIORITIES,
} from "@repo/db";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { FEATURES, hasFeature } from "@repo/permissions";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  notifySubmitterOfOperatorReply,
  notifySubmitterOfResolution,
  notifySubmitterOfPromotion,
} from "@/lib/tickets-notifications";
import type { ActionResult } from "@/types/actions";

/**
 * Operator-side helpdesk actions. Authorization boundary: auth() +
 * hasFeature(ADMIN_TICKETS) — an already-authorized operator mutating ANY
 * ticket, so a client-supplied ticketId is correct here (same reasoning as
 * updateFeedbackStatus in ../feedback/actions.ts). Every state change is
 * audited AND written to the ticket_actions timeline; the timeline is what
 * the thread renders, the audit row is the security record.
 */

async function requireOperator(): Promise<
  | { ok: true; userId: string; email: string | null; name: string | null }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  if (!hasFeature(session.user.features, FEATURES.ADMIN_TICKETS)) {
    return { ok: false, error: "Forbidden." };
  }
  return {
    ok: true,
    userId: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}

async function loadTicket(ticketId: string) {
  return db.query.tickets.findFirst({
    where: eq(schema.tickets.id, ticketId),
  });
}

async function submitterEmail(userId: string): Promise<string | null> {
  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { email: true },
  });
  return row?.email ?? null;
}

export async function setTicketStatusAction(
  ticketId: string,
  newStatus: string,
): Promise<ActionResult> {
  const op = await requireOperator();
  if (!op.ok) return op;

  const check = await validateTicketTransition(db, ticketId, newStatus);
  if (!check.ok) return check;

  const ticket = await loadTicket(ticketId);
  if (!ticket) return { ok: false, error: "Ticket not found." };

  await db
    .update(schema.tickets)
    .set({ status: newStatus })
    .where(eq(schema.tickets.id, ticketId));
  await db.insert(schema.ticketActions).values({
    ticketId,
    action: "status_changed",
    fromValue: check.from,
    toValue: newStatus,
    actorUserId: op.userId,
  });
  await recordAudit({
    action: AUDIT_ACTIONS.TICKET_STATUS_CHANGED,
    resourceType: "ticket",
    resourceId: ticketId,
    metadata: { from: check.from, to: newStatus },
  });

  if (newStatus === "resolved" || newStatus === "declined") {
    const email = await submitterEmail(ticket.submitterUserId);
    if (email) {
      await notifySubmitterOfResolution({
        ticketId,
        subject: ticket.subject,
        submitterEmail: email,
        resolvedAs: newStatus,
      });
    }
  }
  return { ok: true };
}

export async function assignTicketAction(
  ticketId: string,
  assigneeUserId: string | null,
): Promise<ActionResult> {
  const op = await requireOperator();
  if (!op.ok) return op;

  const ticket = await loadTicket(ticketId);
  if (!ticket) return { ok: false, error: "Ticket not found." };

  let toLabel: string | null = null;
  if (assigneeUserId) {
    const assignee = await db.query.users.findFirst({
      where: eq(schema.users.id, assigneeUserId),
      columns: { id: true, name: true, email: true },
    });
    if (!assignee) return { ok: false, error: "Assignee not found." };
    toLabel = assignee.name ?? assignee.email ?? assignee.id;
  }

  await db
    .update(schema.tickets)
    .set({ assigneeUserId })
    .where(eq(schema.tickets.id, ticketId));
  await db.insert(schema.ticketActions).values({
    ticketId,
    action: "assigned",
    toValue: toLabel,
    actorUserId: op.userId,
  });
  await recordAudit({
    action: AUDIT_ACTIONS.TICKET_ASSIGNED,
    resourceType: "ticket",
    resourceId: ticketId,
    metadata: { assigneeUserId },
  });
  return { ok: true };
}

function vocabularyAction(
  column: "changeClass" | "area" | "priority",
  vocabulary: readonly string[],
  timelineAction: "reclassified" | "area_changed" | "priority_changed",
  auditAction:
    | typeof AUDIT_ACTIONS.TICKET_RECLASSIFIED
    | typeof AUDIT_ACTIONS.TICKET_AREA_CHANGED
    | typeof AUDIT_ACTIONS.TICKET_PRIORITY_CHANGED,
) {
  return async (ticketId: string, value: string): Promise<ActionResult> => {
    const op = await requireOperator();
    if (!op.ok) return op;
    if (!vocabulary.includes(value)) {
      return { ok: false, error: `Unknown value '${value}'.` };
    }
    const ticket = await loadTicket(ticketId);
    if (!ticket) return { ok: false, error: "Ticket not found." };
    const from = ticket[column];
    if (from === value) return { ok: true };

    await db
      .update(schema.tickets)
      .set({ [column]: value })
      .where(eq(schema.tickets.id, ticketId));
    await db.insert(schema.ticketActions).values({
      ticketId,
      action: timelineAction,
      fromValue: from,
      toValue: value,
      actorUserId: op.userId,
    });
    await recordAudit({
      action: auditAction,
      resourceType: "ticket",
      resourceId: ticketId,
      metadata: { from, to: value },
    });
    return { ok: true };
  };
}

export async function reclassifyTicketAction(
  ticketId: string,
  value: string,
): Promise<ActionResult> {
  return vocabularyAction(
    "changeClass",
    CHANGE_CLASSES,
    "reclassified",
    AUDIT_ACTIONS.TICKET_RECLASSIFIED,
  )(ticketId, value);
}

export async function setTicketAreaAction(
  ticketId: string,
  value: string,
): Promise<ActionResult> {
  return vocabularyAction(
    "area",
    TICKET_AREAS,
    "area_changed",
    AUDIT_ACTIONS.TICKET_AREA_CHANGED,
  )(ticketId, value);
}

export async function setTicketPriorityAction(
  ticketId: string,
  value: string,
): Promise<ActionResult> {
  return vocabularyAction(
    "priority",
    TICKET_PRIORITIES,
    "priority_changed",
    AUDIT_ACTIONS.TICKET_PRIORITY_CHANGED,
  )(ticketId, value);
}

export async function replyToTicketAsOperatorAction(
  ticketId: string,
  body: string,
): Promise<ActionResult> {
  const op = await requireOperator();
  if (!op.ok) return op;

  const valid = validateTicketReply(body);
  if (valid.kind === "invalid_input") {
    return { ok: false, error: valid.errors.join(" ") };
  }
  const ticket = await loadTicket(ticketId);
  if (!ticket) return { ok: false, error: "Ticket not found." };

  // audit-exempt: an operator reply is content authoring; state changes (the security-relevant mutations) are audited above
  await db.insert(schema.ticketMessages).values({
    ticketId,
    authorKind: "operator",
    authorUserId: op.userId,
    body: body.trim(),
  });

  const email = await submitterEmail(ticket.submitterUserId);
  if (email) {
    await notifySubmitterOfOperatorReply({
      ticketId,
      subject: ticket.subject,
      submitterEmail: email,
    });
  }
  return { ok: true };
}

/**
 * Promote a feedback row into a ticket. Gated on ADMIN_TICKETS (the
 * operator is CREATING a ticket; viewing feedback is ADMIN_FEEDBACK — a
 * triager without ticket rights sees no promote control, and the server
 * enforces the same split here).
 */
export async function promoteFeedbackToTicketAction(
  feedbackId: string,
): Promise<ActionResult<{ ticketId: string }>> {
  const op = await requireOperator();
  if (!op.ok) return op;

  const check = await validateFeedbackPromotion(db, feedbackId);
  if (!check.ok) return check;

  const subject =
    check.row.body.length > 80
      ? `${check.row.body.slice(0, 77)}...`
      : check.row.body;

  const [ticket] = await db
    .insert(schema.tickets)
    .values({
      submitterUserId: check.row.userId,
      subject: subject || "Promoted feedback",
      changeClass: "feature",
      area: "other",
      priority: "normal",
    })
    .returning({ id: schema.tickets.id });

  await db.insert(schema.ticketMessages).values({
    ticketId: ticket.id,
    authorKind: "submitter",
    authorUserId: check.row.userId,
    body: check.row.body,
  });
  await db.insert(schema.ticketActions).values({
    ticketId: ticket.id,
    action: "promoted_from_feedback",
    fromValue: feedbackId,
  });
  await db
    .update(schema.feedback)
    .set({ status: "triaged", promotedToTicketId: ticket.id })
    .where(eq(schema.feedback.id, feedbackId));

  await recordAudit({
    action: AUDIT_ACTIONS.FEEDBACK_PROMOTED_TO_TICKET,
    resourceType: "ticket",
    resourceId: ticket.id,
    metadata: { feedbackId },
  });

  const email = await submitterEmail(check.row.userId);
  if (email) {
    await notifySubmitterOfPromotion({
      ticketId: ticket.id,
      subject,
      submitterEmail: email,
    });
  }

  return { ok: true, data: { ticketId: ticket.id } };
}
