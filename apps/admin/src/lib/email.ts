import "server-only";
import { queueEmail } from "@repo/db";
import { db } from "@/lib/db";

/**
 * Admin's outbound-email entry point.
 *
 * 2026-09-05: this used to send DIRECTLY via Resend. Its own header admitted
 * the cost — "a transient Resend outage means the email is simply lost (no
 * retry, no persisted record)" — and since invite email is the only way a new
 * admin gets access, that loss sat on the critical path. Chris: "admin should
 * not use resend directly" / "make emails more robust".
 *
 * It now persists to the SHARED email_queue (public schema, packages/db) and
 * returns. The cron worker sends it, with the retry budget, exponential
 * backoff, permanent-failure handling, and Resend delivery-webhook tracking
 * that queue already had — none of which this app previously got.
 *
 * Deliberately no inline send attempt, unlike Portal's own enqueue. Portal
 * keeps one because password-reset mail is user-facing and waiting for the
 * cron would be a visibly worse experience. Admin's mail is invites and
 * notifications, where a few minutes' delay is irrelevant and not depending
 * on Resend at request time is strictly better. That also means this app now
 * needs no RESEND_API_KEY at all.
 *
 * The function keeps its name and its `{ sent }` shape so call sites are
 * unchanged — but note `sent` now means "durably queued", which is the
 * honest guarantee. The old name promised queuing it did not do; this one
 * actually queues.
 */
export type EnqueueEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  templateKey?: string;
  /** Optional dedupe key — see packages/db queueEmail(). */
  idempotencyKey?: string;
};

export async function enqueueEmail(
  input: EnqueueEmailInput,
): Promise<{ sent: boolean; id?: string }> {
  try {
    const { id } = await queueEmail(db, {
      app: "admin",
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      from: input.from,
      replyTo: input.replyTo,
      templateKey: input.templateKey ?? "admin_generic",
      idempotencyKey: input.idempotencyKey,
    });
    return { sent: true, id };
  } catch (err) {
    // A queue-write failure must not take down createUserAction /
    // resendInviteAction, whose own DB writes have already committed —
    // same non-throwing contract the direct-send version had.
    console.error("[platform-admin email] failed to queue message", input.subject, err);
    return { sent: false };
  }
}
