import "server-only";

import { Resend } from "resend";

// MAIL_API_KEY is the canonical name, changed 2026-09-07 (Chris: "If you can't
// just change the name in the code. I don't have it.").
//
// This used to read RESEND_API_KEY. Greg set the key on Portal staging as
// MAIL_API_KEY, and it cannot be renamed from here — Vercel stores it as Secret
// type and returns the literal string "[SENSITIVE]" rather than the value, so
// re-adding it under another name requires someone who holds it. Neither Chris
// nor I do. Renaming the CODE is the only move available, and is better than
// the dual-read bridge that was here briefly: two accepted names leaves "which
// one is actually set?" for someone to answer later.
//
// Known inconsistency, accepted deliberately: the siblings RESEND_FROM_EMAIL
// and RESEND_WEBHOOK_SECRET keep their names, because those ARE set correctly
// and renaming them would be churn for symmetry alone. So this app reads
// MAIL_API_KEY next to two RESEND_* variables. Ugly, honest, and matches what
// is actually deployed.
//
// Why this mattered enough to chase: sendEmail() only throws when
// NODE_ENV === "production". Staging is a preview environment, so with no key
// under the expected name it logged the recipient and subject and returned as
// though it sent — the queue drained, nothing errored, and email appeared to
// work while nothing left the building.
const apiKey = process.env.MAIL_API_KEY;
const fromDefault =
  process.env.RESEND_FROM_EMAIL ?? "the portal <noreply@the ancestor site>";

const client = apiKey ? new Resend(apiKey) : null;

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
};

export async function sendEmail(input: SendEmailInput) {
  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MAIL_API_KEY is not set in production");
    }
    console.warn("[email] MAIL_API_KEY missing — logging instead of sending");
    console.warn(
      `[email] to=${input.to} subject=${input.subject} htmlLen=${input.html.length} textLen=${input.text?.length ?? 0}`,
    );
    return { id: "dev-noop" };
  }
  const res = await client.emails.send({
    from: input.from ?? fromDefault,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
  });
  if (res.error) throw new Error(res.error.message);
  return { id: res.data?.id ?? "" };
}

/**
 * @deprecated Call enqueueEmail() directly with templateKey: 'password_reset'.
 * Kept for fork backward compat. The two starter call sites have been migrated.
 * Will be removed in a future version.
 *
 * NOTE: This intentionally calls sendEmail() directly (fire-and-forget) rather
 * than enqueueEmail() to avoid a circular import:
 *   send.ts → queue.ts → send.ts
 */
export async function sendPasswordResetEmail(to: string, rawToken: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

  return sendEmail({
    to,
    subject: "Reset your password",
    html: `
      <p>Hi,</p>
      <p>Someone requested a password reset for your account.</p>
      <p>Click the link below to set a new password. This link expires in 60 minutes.</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
    text: `Click the link below to reset your password. This link expires in 60 minutes.\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
  });
}
