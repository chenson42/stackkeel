import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { tickets, ticketMessages, ticketActions } from "./schema/support";
import { feedback } from "./schema/platform";
import { users, roles, userRoles, roleFeatures } from "./schema/identity";

/**
 * Helpdesk business logic — module `helpdesk`. Same trust posture as
 * feedback.ts: these helpers are NOT the security boundary. Every function
 * takes `db` plus already-authorized identifiers; the boundary is each
 * app's own server action (auth() + hasFeature()/ownership checks) — the
 * ONLY callers these should ever have.
 *
 * All mutation-adjacent helpers return typed discriminated results and
 * never throw for authorization or validation outcomes; the actual INSERT/
 * UPDATE statements stay in each app's action file so check:audit sees a
 * real mutation to examine (same split validateFeedbackTransition uses —
 * see that function's comment).
 */

// ---------------------------------------------------------------------------
// Controlled vocabularies — single source of truth for the CHECK constraints
// in schema/support.ts. Each app's client-safe labels file re-declares these
// (server-only poisoning — see apps/portal/src/lib/tickets-labels.ts).
// ---------------------------------------------------------------------------

export const CHANGE_CLASSES = ["content", "config", "theme", "bug", "feature"] as const;
export const TICKET_AREAS = ["account", "billing", "content", "website", "other"] as const;
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const TICKET_STATUSES = [
  "new",
  "triaged",
  "in_progress",
  "resolved",
  "declined",
] as const;

export type ChangeClass = (typeof CHANGE_CLASSES)[number];
export type TicketArea = (typeof TICKET_AREAS)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type TicketRow = typeof tickets.$inferSelect;
export type TicketMessageRow = typeof ticketMessages.$inferSelect;
export type TicketActionRow = typeof ticketActions.$inferSelect;

/**
 * Legal status transitions. Unlike feedback's forward-only machine, a
 * ticket may be REOPENED: resolved/declined → in_progress (an operator
 * decision, e.g. after a submitter reply shows the fix didn't hold).
 */
export const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  new: ["triaged", "in_progress", "resolved", "declined"],
  triaged: ["in_progress", "resolved", "declined"],
  in_progress: ["resolved", "declined"],
  resolved: ["in_progress"],
  declined: ["in_progress"],
};

export const SUBJECT_MAX = 200;
export const TICKET_BODY_MAX = 5000;

export type TicketValidation =
  | { kind: "ok" }
  | { kind: "invalid_input"; errors: string[] };

/** Pure validation for the file-ticket form. */
export function validateFileTicketInput(input: {
  subject: string;
  body: string;
  changeClass: string;
  area: string;
  priority: string;
}): TicketValidation {
  const errors: string[] = [];
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (subject.length < 1 || subject.length > SUBJECT_MAX)
    errors.push(`Subject must be 1-${SUBJECT_MAX} characters.`);
  if (body.length < 1 || body.length > TICKET_BODY_MAX)
    errors.push(`Message must be 1-${TICKET_BODY_MAX} characters.`);
  if (!(CHANGE_CLASSES as readonly string[]).includes(input.changeClass))
    errors.push("Unknown category.");
  if (!(TICKET_AREAS as readonly string[]).includes(input.area))
    errors.push("Unknown area.");
  if (!(TICKET_PRIORITIES as readonly string[]).includes(input.priority))
    errors.push("Unknown priority.");
  return errors.length > 0 ? { kind: "invalid_input", errors } : { kind: "ok" };
}

/** Pure reply validation (both author kinds). */
export function validateTicketReply(body: string): TicketValidation {
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > TICKET_BODY_MAX) {
    return {
      kind: "invalid_input",
      errors: [`Message must be 1-${TICKET_BODY_MAX} characters.`],
    };
  }
  return { kind: "ok" };
}

/**
 * Validate (but do NOT perform) a status transition — the mutation stays in
 * the app's action file (see module header).
 */
export async function validateTicketTransition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  ticketId: string,
  newStatus: string,
): Promise<{ ok: true; from: TicketStatus } | { ok: false; error: string }> {
  if (!(TICKET_STATUSES as readonly string[]).includes(newStatus)) {
    return { ok: false, error: `Invalid status '${newStatus}'.` };
  }
  const row = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    columns: { status: true },
  });
  if (!row) return { ok: false, error: "Ticket not found." };
  const from = row.status as TicketStatus;
  const allowed = TICKET_TRANSITIONS[from] ?? [];
  if (!allowed.includes(newStatus as TicketStatus)) {
    return {
      ok: false,
      error: `Cannot change status from '${from}' to '${newStatus}'.`,
    };
  }
  return { ok: true, from };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** A submitter's own tickets, newest first. Caller-trusted userId — the
 *  boundary is the app's zero-argument wrapper (see feedback.ts's
 *  getFeedbackByUserId for the full rationale). */
export async function getTicketsByUserId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
): Promise<TicketRow[]> {
  return db.query.tickets.findMany({
    where: eq(tickets.submitterUserId, userId),
    orderBy: [desc(tickets.createdAt)],
    limit: 200,
  });
}

/** One ticket row + submitter display name (privacy: name only, never
 *  email — same PII constraint as listFeedback). */
export interface TicketWithSubmitter extends TicketRow {
  submitterName: string | null;
}

export interface ListTicketsInput {
  status?: string;
  priority?: string;
  area?: string;
  limit?: number;
  /** Keyset cursor — id of the last row already seen (see listFeedback). */
  cursor?: string;
}

export interface ListTicketsResult {
  rows: TicketWithSubmitter[];
  nextCursor: string | null;
}

/** Cross-user triage read for an already-authorized operator. NOT the
 *  security boundary (caller's hasFeature(ADMIN_TICKETS) is). */
export async function listTickets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: ListTicketsInput = {},
): Promise<ListTicketsResult> {
  const limit = input.limit ?? 50;
  const filters = [];
  if (input.status) filters.push(eq(tickets.status, input.status));
  if (input.priority) filters.push(eq(tickets.priority, input.priority));
  if (input.area) filters.push(eq(tickets.area, input.area));
  if (input.cursor) {
    filters.push(
      sql`(${tickets.createdAt}, ${tickets.id}) < (SELECT created_at, id FROM ${tickets} WHERE id = ${input.cursor})`,
    );
  }

  const rows = await db
    .select({
      id: tickets.id,
      submitterUserId: tickets.submitterUserId,
      subject: tickets.subject,
      changeClass: tickets.changeClass,
      area: tickets.area,
      priority: tickets.priority,
      status: tickets.status,
      assigneeUserId: tickets.assigneeUserId,
      createdAt: tickets.createdAt,
      // PII CONSTRAINT: users.name only — NEVER users.email.
      submitterName: users.name,
    })
    .from(tickets)
    .leftJoin(users, eq(tickets.submitterUserId, users.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(tickets.createdAt), desc(tickets.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { rows: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}

export interface TicketThread {
  ticket: TicketWithSubmitter;
  messages: Array<TicketMessageRow & { authorName: string | null }>;
  actions: TicketActionRow[];
}

/**
 * Full thread for one ticket. `scope` is the caller's ALREADY-DECIDED
 * authorization: "submitter" additionally requires the ticket to belong to
 * `userId` (returns null otherwise — indistinguishable from not-found, on
 * purpose); "operator" reads any ticket.
 */
export async function getTicketThread(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  ticketId: string,
  scope: { kind: "submitter"; userId: string } | { kind: "operator" },
): Promise<TicketThread | null> {
  const filters = [eq(tickets.id, ticketId)];
  if (scope.kind === "submitter") {
    filters.push(eq(tickets.submitterUserId, scope.userId));
  }
  const [ticket] = await db
    .select({
      id: tickets.id,
      submitterUserId: tickets.submitterUserId,
      subject: tickets.subject,
      changeClass: tickets.changeClass,
      area: tickets.area,
      priority: tickets.priority,
      status: tickets.status,
      assigneeUserId: tickets.assigneeUserId,
      createdAt: tickets.createdAt,
      submitterName: users.name,
    })
    .from(tickets)
    .leftJoin(users, eq(tickets.submitterUserId, users.id))
    .where(and(...filters))
    .limit(1);
  if (!ticket) return null;

  const messages = await db
    .select({
      id: ticketMessages.id,
      ticketId: ticketMessages.ticketId,
      authorKind: ticketMessages.authorKind,
      authorUserId: ticketMessages.authorUserId,
      body: ticketMessages.body,
      createdAt: ticketMessages.createdAt,
      authorName: users.name,
    })
    .from(ticketMessages)
    .leftJoin(users, eq(ticketMessages.authorUserId, users.id))
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(asc(ticketMessages.createdAt));

  const actions = await db.query.ticketActions.findMany({
    where: eq(ticketActions.ticketId, ticketId),
    orderBy: [asc(ticketActions.appliedAt)],
  });

  return { ticket, messages, actions };
}

// ---------------------------------------------------------------------------
// Notification recipient resolution
// ---------------------------------------------------------------------------

export interface TicketOperator {
  userId: string;
  email: string;
  name: string | null;
}

/**
 * Users who should be emailed about ticket activity: every ACTIVE user
 * holding a role that grants the given feature key (callers pass
 * FEATURES.ADMIN_TICKETS), PLUS every active holder of the admin role —
 * the admin grant comes from code, not role_features rows (anti-lockout
 * invariant), so a pure role_features join would silently miss admins.
 */
export async function getTicketOperators(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  adminTicketsFeatureKey: string,
  adminRoleName: string,
): Promise<TicketOperator[]> {
  const viaFeature = db
    .select({ roleId: roleFeatures.roleId })
    .from(roleFeatures)
    .where(eq(roleFeatures.featureKey, adminTicketsFeatureKey));

  const rows = await db
    .selectDistinct({ userId: users.id, email: users.email, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        eq(users.accountStatus, "active"),
        sql`(${roles.name} = ${adminRoleName} or ${inArray(roles.id, viaFeature)})`,
      ),
    );
  return rows.filter((r: TicketOperator) => Boolean(r.email));
}

// ---------------------------------------------------------------------------
// Feedback promotion (validation half — the writes stay in the action file)
// ---------------------------------------------------------------------------

export async function validateFeedbackPromotion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  feedbackId: string,
): Promise<
  | { ok: true; row: { id: string; userId: string; body: string; status: string } }
  | { ok: false; error: string }
> {
  const row = await db.query.feedback.findFirst({
    where: eq(feedback.id, feedbackId),
    columns: { id: true, userId: true, body: true, status: true, promotedToTicketId: true },
  });
  if (!row) return { ok: false, error: "Feedback not found." };
  if (row.promotedToTicketId) {
    return { ok: false, error: "Already promoted to a ticket." };
  }
  // Promotion is a triage outcome: legal from 'new' or 'triaged' only —
  // 'done'/'declined' are terminal (FEEDBACK_TRANSITIONS in feedback.ts).
  if (row.status !== "new" && row.status !== "triaged") {
    return { ok: false, error: `Cannot promote feedback in status '${row.status}'.` };
  }
  return { ok: true, row };
}
