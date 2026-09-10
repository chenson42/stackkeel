import { and, desc, eq, sql } from "drizzle-orm";
import { emailQueue } from "./schema/platform";

/**
 * Insert-only enqueue for the shared email queue. Apps must never call the
 * email provider directly — everything goes through the queue.
 *
 * This deliberately does NOT send. It persists the message and returns; the
 * cron worker picks it up on its next pass. That is the whole robustness
 * argument: the caller's success no longer depends on the provider being
 * reachable at request time, and a provider outage costs a few minutes of
 * delay instead of a lost message. (An app MAY additionally attempt an
 * inline send before falling back to the worker — a latency optimisation
 * worth having for user-facing mail like password resets — both paths write
 * the same rows; only the send timing differs.)
 *
 * The `db` client is injected rather than imported so this module stays
 * app-agnostic, same as packages/auth's recordAuditShared().
 */
export interface QueueEmailInput {
  /** Which app is enqueuing: "portal" | "admin". */
  app: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  /** Label for the email type, e.g. "admin_invite". */
  templateKey: string;
  /** Defaults to 8: the worker's own default retry budget. */
  maxAttempts?: number;
  /**
   * Optional dedupe key. When supplied, enqueuing the same key twice is a
   * no-op that returns the EXISTING row's id rather than inserting a second
   * message or throwing. Callers that omit it are unaffected — NULLs are
   * distinct in the unique index.
   *
   * Use something stable and meaningful, e.g. `invite:<userId>:<tokenId>`,
   * not a random value, or it dedupes nothing.
   */
  idempotencyKey?: string;
}

export async function queueEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: QueueEmailInput,
): Promise<{ id: string }> {
  // onConflictDoNothing + a follow-up read rather than a pre-check: a
  // pre-check would still race two concurrent callers between SELECT and
  // INSERT. Letting the unique index arbitrate means the database decides,
  // and the loser reads back the winner's row.
  const [row] = await db
    .insert(emailQueue)
    .values({
      app: input.app,
      idempotencyKey: input.idempotencyKey ?? null,
      toEmail: input.to,
      fromEmail: input.from ?? null,
      replyTo: input.replyTo ?? null,
      subject: input.subject,
      htmlBody: input.html,
      textBody: input.text ?? null,
      templateKey: input.templateKey,
      maxAttempts: input.maxAttempts ?? 8,
      // nextAttemptAt left null = eligible on the worker's next pass.
    })
    .onConflictDoNothing({ target: emailQueue.idempotencyKey })
    .returning({ id: emailQueue.id });

  if (row) return { id: row.id };

  // Conflict: this key is already queued. Return the existing row so the
  // caller still gets an id and treats it as success — the message IS
  // queued, just not by this call.
  const existing = await db.query.emailQueue.findFirst({
    where: eq(emailQueue.idempotencyKey, input.idempotencyKey!),
    columns: { id: true },
  });
  return { id: existing?.id ?? "" };
}

/** One row as returned by `listEmailQueue()` — pinned to the table's own
 * inferred select type per the design doc's own warning: this mapper went
 * stale twice in one day when hand-written as a separate interface. */
export type EmailQueueRow = typeof emailQueue.$inferSelect;

export interface ListEmailQueueInput {
  /** Filter to one originating app. Omit for all apps (the cross-app view). */
  app?: string;
  /** Filter to one status ('queued' | 'processing' | 'sent' | 'failed'). Omit for all. */
  status?: string;
  /** Page size. Defaults to 50 — the queue is now fed by three apps' worth of traffic. */
  limit?: number;
  /**
   * Opaque keyset cursor from a previous call's `nextCursor`. Omit for the
   * first page. It is the `id` of the last row already seen — keyset rather
   * than OFFSET so a row inserted mid-pagination can't shift later pages (an
   * OFFSET page would silently skip or repeat a row).
   *
   * DO NOT put the timestamp in this cursor. It used to encode
   * `<createdAt ISO>:<id>`, which silently DROPPED rows — see the comment on
   * the cursor filter below.
   */
  cursor?: string;
}

export interface ListEmailQueueResult {
  rows: EmailQueueRow[];
  /** Pass back as `cursor` to fetch the next page. Null when this was the last page. */
  nextCursor: string | null;
}

function encodeCursor(row: EmailQueueRow): string {
  return row.id;
}

/**
 * Read-only, paginated listing for the admin queue viewer — the one shared
 * query, ordered newest first.
 *
 * `db` is injected rather than imported, matching every other function in
 * this module.
 */
export async function listEmailQueue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: ListEmailQueueInput = {},
): Promise<ListEmailQueueResult> {
  const limit = input.limit ?? 50;

  const filters = [];
  if (input.app) filters.push(eq(emailQueue.app, input.app));
  if (input.status) filters.push(eq(emailQueue.status, input.status));
  if (input.cursor) {
    // The comparison timestamp NEVER leaves Postgres.
    //
    // The previous version round-tripped it through JavaScript: the cursor
    // carried `createdAt.toISOString()`, and the filter was
    // `created_at < $cursorTs OR (created_at = $cursorTs AND id < $cursorId)`.
    // Postgres stores timestamptz at MICROSECOND precision; a JS Date holds
    // only MILLISECONDS, so the driver had already truncated it before the
    // cursor was built. A row stored at 12:00:00.123456 compared against a
    // cursor of 12:00:00.123 is neither `<` nor `=` — so it satisfied neither
    // branch and was silently dropped from every subsequent page.
    //
    // Not hypothetical: this shipped in a predecessor codebase, with the
    // admin queue viewer as the live caller. It lost any row whose
    // microsecond remainder was non-zero as soon as you pressed "Load more"
    // — which, for rows inserted by the same enqueue burst, is most of them.
    // Found by a test-coverage review writing real-Postgres tests.
    //
    // The cursor is now just the row id, and the row-value comparison happens
    // entirely inside Postgres against that row's own stored timestamp, at
    // full precision. `(created_at, id) < (...)` matches the ORDER BY exactly.
    filters.push(
      sql`(${emailQueue.createdAt}, ${emailQueue.id}) < (SELECT created_at, id FROM ${emailQueue} WHERE id = ${input.cursor})`,
    );
  }

  const rows: EmailQueueRow[] = await db
    .select()
    .from(emailQueue)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(emailQueue.createdAt), desc(emailQueue.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    rows: page,
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
  };
}
