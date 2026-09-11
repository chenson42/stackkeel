import { and, desc, eq, sql } from "drizzle-orm";
import { feedback } from "./schema/platform";
import { users } from "./schema/identity";

/** One feedback row exactly as stored. */
export type FeedbackRow = typeof feedback.$inferSelect;

/**
 * SECURITY NOTE — this is NOT the security boundary. `userId` is a plain
 * parameter and this function trusts its caller completely, the same way
 * isFlagEnabledFor()/queueEmail() trust the `db` client they're handed. The
 * boundary is each app's own zero-argument getMyFeedback() wrapper — the
 * ONLY caller this function should ever have. Never call this from a route
 * handler, a server action's input, or anywhere `userId` could originate
 * from a client-supplied value.
 *
 * No app filter — a user's feedback history is cross-app by design. Capped
 * at 200 rows, most recent first — an account-settings list, not a
 * paginated admin view; the 5/hour/user submit rate limit makes 200 rows
 * represent months of continuous submission at the ceiling. If this cap is
 * ever hit in practice, that itself is worth a human look, not silently
 * raised.
 */
const MY_FEEDBACK_LIMIT = 200;

export async function getFeedbackByUserId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
): Promise<FeedbackRow[]> {
  return db.query.feedback.findMany({
    where: eq(feedback.userId, userId),
    orderBy: [desc(feedback.createdAt)],
    limit: MY_FEEDBACK_LIMIT,
  });
}

// ---------------------------------------------------------------------------
// Cross-app admin triage
// ---------------------------------------------------------------------------

/**
 * Legal status transitions — the single source of truth for the feedback
 * state machine, so every current and future triage surface validates
 * against the identical table, not a hand-copied duplicate that can drift.
 * Terminal states map to an empty array.
 */
export const FEEDBACK_TRANSITIONS: Record<string, readonly string[]> = {
  new: ["triaged", "declined"],
  triaged: ["done", "declined"],
  done: [],
  declined: [],
};
export const KNOWN_FEEDBACK_STATUSES = new Set(Object.keys(FEEDBACK_TRANSITIONS));

/** One feedback row plus the submitter's DISPLAY NAME ONLY.
 *  NEVER add an email field here — AGENTS.md invariant: "Admin triage shows
 *  display name only, never email." */
export interface FeedbackWithSubmitter extends FeedbackRow {
  memberName: string | null;
}

export interface ListFeedbackInput {
  /** Filter to one originating app. Omit for all apps — the cross-app view
   *  is the whole point of this primitive, unlike getFeedbackByUserId. */
  app?: string;
  /** Filter to one status. Omit for all. */
  status?: string;
  /** Page size. Defaults to 50, matching listEmailQueue's own default. */
  limit?: number;
  /** Opaque keyset cursor — the `id` of the last row already seen. The
   *  row-value comparison happens entirely inside Postgres — see
   *  listEmailQueue's own comment for why a JS-side timestamp cursor
   *  silently drops rows at the microsecond boundary. */
  cursor?: string;
}

export interface ListFeedbackResult {
  rows: FeedbackWithSubmitter[];
  nextCursor: string | null;
}

/** Cross-app, unscoped read for an already-authorized admin viewer. NOT the
 *  security boundary — takes no permission argument and applies no
 *  ownership predicate by design (contrast getFeedbackByUserId, which is
 *  the opposite shape for the opposite reason). The caller's own
 *  hasFeature(..., FEATURES.ADMIN_FEEDBACK) check IS the boundary. */
export async function listFeedback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: ListFeedbackInput = {},
): Promise<ListFeedbackResult> {
  const limit = input.limit ?? 50;
  const filters = [];
  if (input.app) filters.push(eq(feedback.app, input.app));
  if (input.status) filters.push(eq(feedback.status, input.status));
  if (input.cursor) {
    filters.push(
      sql`(${feedback.createdAt}, ${feedback.id}) < (SELECT created_at, id FROM ${feedback} WHERE id = ${input.cursor})`,
    );
  }

  const rows = await db
    .select({
      id: feedback.id,
      userId: feedback.userId,
      app: feedback.app,
      category: feedback.category,
      body: feedback.body,
      contextPath: feedback.contextPath,
      appVersion: feedback.appVersion,
      status: feedback.status,
      promotedToTicketId: feedback.promotedToTicketId,
      createdAt: feedback.createdAt,
      // PII CONSTRAINT: users.name only — NEVER users.email.
      memberName: users.name,
    })
    .from(feedback)
    .leftJoin(users, eq(feedback.userId, users.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(feedback.createdAt), desc(feedback.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { rows: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}

/**
 * Validate (but do NOT perform) a status transition. Deliberately does not
 * execute the UPDATE itself: the actual mutation must stay in each app's
 * own action file so that file's own check:audit tripwire (whose heuristic
 * only exempts a mutation on the line directly above an `audit-exempt`
 * comment) still sees a real mutation to examine rather than none at all.
 */
export async function validateFeedbackTransition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  feedbackId: string,
  newStatus: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!KNOWN_FEEDBACK_STATUSES.has(newStatus)) {
    return { ok: false, error: `Invalid status '${newStatus}'.` };
  }
  const row = await db.query.feedback.findFirst({
    where: eq(feedback.id, feedbackId),
    columns: { status: true },
  });
  if (!row) return { ok: false, error: "Feedback not found." };
  const allowed = FEEDBACK_TRANSITIONS[row.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return {
      ok: false,
      error: `Cannot change status from '${row.status}' to '${newStatus}'.`,
    };
  }
  return { ok: true };
}
