import "server-only";

import { db } from "@/lib/db";
import { emailQueue, auditEvents } from "@/lib/db/schema";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { sql, and, eq, lt } from "drizzle-orm";
import { sendEmail } from "./send";

// ----- recordDeliveryEvent -------------------------------------------------
// Called by POST /api/webhooks/resend to backfill delivery-status timestamps
// onto queue rows matched by providerMessageId (see DECISION-028).
// The webhook handler owns HTTP semantics; this function owns the DB write.

export type DeliveryEventType =
  | "email.delivered"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained";

export async function recordDeliveryEvent(
  providerMessageId: string,
  eventType: DeliveryEventType,
  opts?: { occurredAt?: Date; failureReason?: string },
): Promise<{ matched: boolean }> {
  const ts = opts?.occurredAt ?? new Date();
  const cond = eq(emailQueue.providerMessageId, providerMessageId);

  let returned: { id: string }[] | undefined;

  switch (eventType) {
    case "email.delivered":
      returned = await db
        .update(emailQueue)
        .set({ deliveredAt: ts })
        .where(cond)
        .returning({ id: emailQueue.id });
      break;
    case "email.opened":
      returned = await db
        .update(emailQueue)
        .set({ openedAt: ts })
        .where(cond)
        .returning({ id: emailQueue.id });
      break;
    case "email.clicked":
      returned = await db
        .update(emailQueue)
        .set({ clickedAt: ts })
        .where(cond)
        .returning({ id: emailQueue.id });
      break;
    case "email.bounced":
      returned = await db
        .update(emailQueue)
        .set({
          bouncedAt: ts,
          ...(opts?.failureReason ? { failureReason: opts.failureReason } : {}),
        })
        .where(cond)
        .returning({ id: emailQueue.id });
      break;
    case "email.complained":
      returned = await db
        .update(emailQueue)
        .set({ complainedAt: ts })
        .where(cond)
        .returning({ id: emailQueue.id });
      break;
    default: {
      const _exhaustive: never = eventType;
      throw new Error(`Unknown delivery event type: ${String(_exhaustive)}`);
    }
  }

  return { matched: (returned ?? []).length > 0 };
}

// ----- Types ---------------------------------------------------------------

export type EnqueueEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  templateKey: string;
  maxAttempts?: number;
};

export type BatchResult = {
  /** Number of queue rows claimed (transitioned to 'processing') this batch. */
  claimed: number;
  /** Number of claimed rows that sent successfully this batch. */
  sent: number;
  /** Number of claimed rows that permanently failed (exhausted maxAttempts) this batch. */
  failed: number;
  /** Number of stuck 'processing' rows recovered by the lease-recovery pass. */
  requeued: number;
};

// Raw row returned by db.execute(sql`RETURNING *`) on the email_queue table.
// Column names are snake_case (DB names), NOT the Drizzle camelCase field names.
// The Drizzle ORM query builder (insert/update returning) maps to camelCase;
// db.execute with raw SQL does not.
type RawQueueRow = {
  id: string;
  app: string;
  idempotency_key: string | null;
  to_email: string;
  from_email: string | null;
  reply_to: string | null;
  subject: string;
  html_body: string;
  text_body: string | null;
  template_key: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  sent_at: string | null;
  provider_message_id: string | null;
  failure_reason: string | null;
  // Delivery-event timestamps written by the Resend webhook handler.
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  created_at: string;
  updated_at: string;
};

// MAINTENANCE NOTE — this mapper has silently gone stale twice on 2026-09-05
// alone (the `app` column, then `idempotency_key`). Both times typecheck
// caught it only because the return type is pinned to
// `typeof emailQueue.$inferSelect`; that pinning is the whole safety net, so
// do not loosen it to a hand-written interface. Any column added to
// emailQueue must be added HERE and to RawQueueRow above, because the claim
// query uses `RETURNING *` and receives snake_case keys this function is the
// only translator for.
// Exported ONLY so queue.fromRaw.test.ts can exercise it directly against a
// schema-driven raw row (see that file's own header for why: a hand-typed
// fixture row would just re-encode whatever column names the test author
// assumed, same failure mode as a self-agreeing DB mock). Not part of the
// module's public API otherwise — every other caller in this file still
// uses it internally.
export function fromRaw(raw: RawQueueRow): typeof emailQueue.$inferSelect {
  return {
    id: raw.id,
    app: raw.app,
    idempotencyKey: raw.idempotency_key,
    toEmail: raw.to_email,
    fromEmail: raw.from_email,
    replyTo: raw.reply_to,
    subject: raw.subject,
    htmlBody: raw.html_body,
    textBody: raw.text_body,
    templateKey: raw.template_key,
    status: raw.status,
    attemptCount: raw.attempt_count,
    maxAttempts: raw.max_attempts,
    nextAttemptAt: raw.next_attempt_at ? new Date(raw.next_attempt_at) : null,
    lastAttemptAt: raw.last_attempt_at ? new Date(raw.last_attempt_at) : null,
    sentAt: raw.sent_at ? new Date(raw.sent_at) : null,
    providerMessageId: raw.provider_message_id,
    failureReason: raw.failure_reason,
    deliveredAt: raw.delivered_at ? new Date(raw.delivered_at) : null,
    openedAt: raw.opened_at ? new Date(raw.opened_at) : null,
    clickedAt: raw.clicked_at ? new Date(raw.clicked_at) : null,
    bouncedAt: raw.bounced_at ? new Date(raw.bounced_at) : null,
    complainedAt: raw.complained_at ? new Date(raw.complained_at) : null,
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
  };
}

// ----- Backoff formula -----------------------------------------------------
// delay = min(2^(attemptCount-1), 60) minutes
// where attemptCount is the NEW value after increment (1-indexed).
// Sequence: 1m → 2m → 4m → 8m → 16m → 32m → 60m (cap) → 60m
// With maxAttempts=8: attempts 1-7 get backoff; attempt 8 marks FAILED.
// Exported for unit testing only — not part of the public API.

export function computeNextAttemptAt(attemptCount: number): Date {
  const delayMs = Math.min(Math.pow(2, attemptCount - 1), 60) * 60 * 1000;
  return new Date(Date.now() + delayMs);
}

// ----- Dev guard -----------------------------------------------------------
// Called at the top of processQueueBatch(). Loud but non-fatal — a throw here
// would stop ALL email processing even when most rows are healthy.

function warnIfDevVarsInProd(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.EMAIL_DEV_INTERCEPT || process.env.EMAIL_DEV_REDIRECT_TO) {
    console.error(
      "[email-queue] WARNING: dev override env var set in production — " +
        "emails may not reach real recipients",
      {
        EMAIL_DEV_INTERCEPT: !!process.env.EMAIL_DEV_INTERCEPT,
        EMAIL_DEV_REDIRECT_TO: !!process.env.EMAIL_DEV_REDIRECT_TO,
      },
    );
  }
}

// ----- Low-level send attempt (used by both inline and worker paths) -------

async function attemptSend(
  row: typeof emailQueue.$inferSelect,
): Promise<{ providerMessageId: string } | { error: string }> {
  // Dev intercept: skip Resend entirely; treat as sent.
  if (process.env.EMAIL_DEV_INTERCEPT) {
    return { providerMessageId: `dev-intercepted:${row.id}` };
  }

  const recipient = process.env.EMAIL_DEV_REDIRECT_TO ?? row.toEmail;
  if (process.env.EMAIL_DEV_REDIRECT_TO) {
    console.warn(
      `[email-queue] EMAIL_DEV_REDIRECT_TO active: sending to ${recipient} instead of ${row.toEmail}`,
    );
  }

  try {
    const result = await sendEmail({
      to: recipient,
      from: row.fromEmail ?? undefined,
      replyTo: row.replyTo ?? undefined,
      subject: row.subject,
      html: row.htmlBody,
      text: row.textBody ?? undefined,
    });
    return { providerMessageId: result.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ----- enqueueEmail --------------------------------------------------------
// Persist-first: insert the row, attempt inline send, update status.
// Always returns; never throws on send failure.

export async function enqueueEmail(
  input: EnqueueEmailInput,
): Promise<{ id: string; sentInline: boolean }> {
  // 1. Insert with status='queued', nextAttemptAt=null (eligible immediately)
  const [row] = await db
    .insert(emailQueue)
    .values({
      toEmail: input.to,
      fromEmail: input.from ?? null,
      replyTo: input.replyTo ?? null,
      subject: input.subject,
      htmlBody: input.html,
      textBody: input.text ?? null,
      templateKey: input.templateKey,
      maxAttempts: input.maxAttempts ?? 8,
    })
    .returning();

  // 2. Attempt inline send
  const outcome = await attemptSend(row);

  if ("providerMessageId" in outcome) {
    // 3a. Success: mark sent
    await db
      .update(emailQueue)
      .set({
        status: "sent",
        sentAt: new Date(),
        providerMessageId: outcome.providerMessageId,
        attemptCount: 1,
        lastAttemptAt: new Date(),
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(emailQueue.id, row.id));
    return { id: row.id, sentInline: true };
  } else {
    // 3b. Failure: stay queued, schedule first retry in 1 minute
    await db
      .update(emailQueue)
      .set({
        status: "queued",
        attemptCount: 1,
        lastAttemptAt: new Date(),
        nextAttemptAt: computeNextAttemptAt(1),
        failureReason: outcome.error,
        updatedAt: new Date(),
      })
      .where(eq(emailQueue.id, row.id));
    return { id: row.id, sentInline: false };
  }
}

// ----- processQueueBatch ---------------------------------------------------
// Called by the cron route. Performs:
//   Step 0: Dev guard (warn if dev vars set in production)
//   Step 1: Lease recovery (re-queue stuck 'processing' rows > 10 min old)
//   Step 2: Atomic claim via single-statement CTE UPDATE...RETURNING
//           (DECISION-014 exception, DECISION-018)
//   Step 3: Send each claimed row; update status
//   Step 4: Log and return counts

export async function processQueueBatch(limit = 25): Promise<BatchResult> {
  // Step 0: Dev guard
  warnIfDevVarsInProd();

  let requeued = 0;

  // Step 1: Lease recovery — re-queue any 'processing' rows with
  // lastAttemptAt older than 10 minutes (cron function likely crashed mid-batch).
  // This runs BEFORE the claim so recovered rows are eligible for this batch.
  const leaseExpiry = new Date(Date.now() - 10 * 60 * 1000);
  const recovered = await db
    .update(emailQueue)
    .set({
      status: "queued",
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailQueue.status, "processing"),
        lt(emailQueue.lastAttemptAt, leaseExpiry),
      ),
    )
    .returning({ id: emailQueue.id });
  requeued = recovered.length;
  if (requeued > 0) {
    console.warn(`[email-queue] lease-recovery: re-queued ${requeued} stuck rows`);
  }

  // Table moved portal.* -> public.* 2026-09-05 (shared platform service).
  // This raw SQL hardcodes the schema, so it does NOT follow the Drizzle
  // schema object — typecheck could not catch the stale reference and the
  // whole worker would have silently claimed nothing. Grep for a hardcoded
  // schema qualifier whenever a table moves.
  //
  // Deliberately NOT filtered by app: one worker drains the shared queue for
  // every app. the platform Admin therefore needs no cron of its own — its rows
  // are claimed here alongside Portal's.
  //
  // Step 2: Atomic claim — SINGLE STATEMENT, CTE UPDATE...RETURNING.
  // DECISION-014 exception: the UPDATE must consume the IDs produced by the
  // subquery within the same statement. db.batch() cannot do this because
  // write N cannot reference the result of write N-1 in the same batch.
  // See DECISION-018. Two concurrent workers claim disjoint sets via SKIP LOCKED.
  const claimedResult = await db.execute(sql`
    WITH eligible AS (
      SELECT id FROM public.email_queue
      WHERE status = 'queued'
        AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        AND attempt_count < max_attempts
      ORDER BY COALESCE(next_attempt_at, '-infinity'::timestamptz) ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE public.email_queue
    SET status = 'processing',
        last_attempt_at = NOW(),
        updated_at = NOW()
    FROM eligible
    WHERE public.email_queue.id = eligible.id
    RETURNING *
  `);

  // db.execute() with raw SQL returns snake_case column names from the DB.
  // Map to camelCase using fromRaw() before using Drizzle-typed accessors.
  const rows = (claimedResult.rows as RawQueueRow[]).map(fromRaw);
  const claimed = rows.length;
  let sent = 0;
  let failed = 0;

  // Step 3: Process each claimed row
  for (const row of rows) {
    const outcome = await attemptSend(row);
    const newAttemptCount = row.attemptCount + 1;

    if ("providerMessageId" in outcome) {
      // Success
      await db
        .update(emailQueue)
        .set({
          status: "sent",
          sentAt: new Date(),
          providerMessageId: outcome.providerMessageId,
          attemptCount: newAttemptCount,
          failureReason: null,
          updatedAt: new Date(),
        })
        .where(eq(emailQueue.id, row.id));
      sent++;
    } else if (newAttemptCount >= row.maxAttempts) {
      // Permanent failure — exhausted maxAttempts
      await db
        .update(emailQueue)
        .set({
          status: "failed",
          attemptCount: newAttemptCount,
          failureReason: outcome.error,
          updatedAt: new Date(),
        })
        .where(eq(emailQueue.id, row.id));
      failed++;

      // Write audit event for permanent failure (security-relevant: a user's
      // requested email action will never complete). Actor is null (system write).
      // ip/userAgent omitted — nullable in schema, not available in cron context.
      await db.insert(auditEvents).values({
        actorUserId: null,
        actorEmail: row.toEmail,
        action: AUDIT_ACTIONS.EMAIL_QUEUE_PERMANENT_FAILURE,
        resourceType: "email_queue",
        resourceId: row.id,
        metadata: {
          templateKey: row.templateKey,
          toEmail: row.toEmail,
          attemptCount: newAttemptCount,
          failureReason: outcome.error,
        },
      });

      console.error("[email-queue] permanent failure", {
        id: row.id,
        toEmail: row.toEmail,
        templateKey: row.templateKey,
        failureReason: outcome.error,
      });
    } else {
      // Transient failure — requeue with backoff
      await db
        .update(emailQueue)
        .set({
          status: "queued",
          attemptCount: newAttemptCount,
          nextAttemptAt: computeNextAttemptAt(newAttemptCount),
          failureReason: outcome.error,
          updatedAt: new Date(),
        })
        .where(eq(emailQueue.id, row.id));
    }
  }

  return { claimed, sent, failed, requeued };
}
