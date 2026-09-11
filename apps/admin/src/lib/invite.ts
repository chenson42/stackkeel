import "server-only";

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { inviteTokens } from "@/lib/db/schema";
import { enqueueEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/escape-html";

// 7 days, not Portal's 60-minute password-reset window — Phase 3 Edge
// Cases: "an admin-initiated invite isn't consumed as promptly as a
// self-serve reset the requester triggered themselves." Matches
// apps/admin/scripts/seed-first-admin.ts's own INVITE_TOKEN_TTL_MS.
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sha256Hex(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * mintAndSendInvite — the ONE place that mints an admin_invite_tokens row
 * and sends the invite email, shared by createUserAction and
 * resendInviteAction (both api-developer's scope, per Phase 3) so the
 * upsert-overwrite race-window-elimination shape
 * (apps/portal/src/app/(password-reset)/actions.ts's own precedent) and
 * the email copy can't drift between "invite a new user" and "resend an
 * existing invite."
 */
export async function mintAndSendInvite(input: {
  userId: string;
  email: string;
  recipientName?: string | null;
}): Promise<void> {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

  await db
    .insert(inviteTokens)
    .values({ userId: input.userId, token: tokenHash, expiresAt })
    .onConflictDoUpdate({
      target: inviteTokens.userId,
      set: { token: tokenHash, expiresAt, createdAt: new Date() },
    });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
  const setPasswordUrl = `${baseUrl}/set-password?token=${rawToken}`;
  // recipientName is admin-supplied (createUserAction's optional `name`
  // field) — user-controlled text, HTML-escaped before interpolation per
  // apps/portal/CLAUDE.md's invariant (the an earlier project lesson).
  const greetingName = input.recipientName ? escapeHtml(input.recipientName) : "there";

  await enqueueEmail({
    // Keyed on the invite token hash: one email per issued invite. A retried
    // server action or a double-clicked "Resend invite" now returns the
    // already-queued row instead of sending the same link twice. Resending a
    // NEW invite mints a new token, so it correctly gets its own email.
    idempotencyKey: `admin_invite:${tokenHash}`,
    to: input.email,
    subject: "You've been invited to Admin",
    html: `
      <p>Hi ${greetingName},</p>
      <p>An administrator created a Admin account for you. Click the link below to set your password and finish setting up your account. This link expires in 7 days.</p>
      <p><a href="${setPasswordUrl}">${setPasswordUrl}</a></p>
      <p>If you weren't expecting this, you can ignore this email.</p>
    `,
    text: `An administrator created a Admin account for you. Set your password: ${setPasswordUrl}\n\nThis link expires in 7 days. If you weren't expecting this, ignore this email.`,
    templateKey: "admin_invite",
  });
}
