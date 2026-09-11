"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq, and, ne, gt } from "drizzle-orm";
import { compare, hash } from "bcryptjs";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users, emailVerificationTokens, passwordResetTokens } from "@/lib/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { enqueueEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/types/actions";

function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ---------------------------------------------------------------------------
// updateProfile
// ---------------------------------------------------------------------------

export async function updateProfile(input: {
  name: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthorized." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name cannot be blank." };
  if (name.length > 100)
    return { ok: false, error: "Name must be 100 characters or fewer." };

  await db
    .update(users)
    .set({ name })
    .where(eq(users.id, session.user.id));

  await recordAudit({
    action: AUDIT_ACTIONS.USER_PROFILE_UPDATED,
    resourceType: "user",
    resourceId: session.user.id,
    metadata: { name },
  });

  // NOTE: The JWT callback does not refresh users.name on each request, so the
  // name in the session token will lag the DB until the user signs out and back
  // in. The page re-renders via revalidatePath and reads the fresh name from DB.
  // TODO: If real-time nav-shell name refresh is needed, call unstable_update
  // here — but for the starter this is acceptable. See Phase 3 design note.
  revalidatePath("/account");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// requestEmailChange
// ---------------------------------------------------------------------------

export async function requestEmailChange(input: {
  newEmail: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthorized." };

  // Rate limit: 3/hour by userId.
  const limited = await checkRateLimit(
    `email_change:${session.user.id}`,
    { max: 3, windowSeconds: 3600 },
    {
      userId: session.user.id,
      actor: session.user.email ?? session.user.id,
      reason: "email_change_request",
    },
  );
  if (!limited.allowed) {
    const mins = Math.ceil(limited.retryAfterSeconds / 60);
    return {
      ok: false,
      error: `Too many email-change requests. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }

  const newEmail = input.newEmail.trim().toLowerCase();

  // Basic format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  // Must differ from current email (case-insensitive)
  if (newEmail === (session.user.email ?? "").toLowerCase()) {
    return { ok: false, error: "That is already your current email address." };
  }

  // Check cross-user collision
  // TODO: If a Google-OAuth user changes to an email that belongs to a
  // different Google account, a future Google sign-in with that account would
  // link to this user row (allowDangerousEmailAccountLinking=true). This is
  // acceptable in the starter — document and consider in production forks.
  const taken = await db.query.users.findFirst({
    where: and(eq(users.email, newEmail), ne(users.id, session.user.id)),
    columns: { id: true },
  });
  if (taken) return { ok: false, error: "That email is already in use." };

  // Check cross-user pending-token collision: another user may have already
  // requested a change to this address and not yet verified it. Reject early
  // with a friendly message rather than hitting the DB unique constraint at
  // verification time (Phase 3 design, Phase 5 Bug 2).
  const pendingTaken = await db.query.emailVerificationTokens.findFirst({
    where: and(
      eq(emailVerificationTokens.newEmail, newEmail),
      ne(emailVerificationTokens.userId, session.user.id),
      gt(emailVerificationTokens.expiresAt, new Date()),
    ),
    columns: { id: true },
  });
  if (pendingTaken) {
    return { ok: false, error: "That email is already pending verification on another account." };
  }

  // Generate a CSPRNG raw token — this is what travels in the email URL.
  // Only the SHA-256 hash is stored; a DB read cannot be used to forge a link.
  // Mirrors the identical pattern used by passwordResetTokens.
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h

  // Upsert — one pending change per user (uniqueIndex on userId)
  await db
    .insert(emailVerificationTokens)
    .values({
      userId: session.user.id,
      token: tokenHash,
      newEmail,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: emailVerificationTokens.userId,
      set: { token: tokenHash, newEmail, expiresAt, createdAt: new Date() },
    });

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const verifyUrl = `${baseUrl}/account/verify-email/${rawToken}`;

  await enqueueEmail({
    to: newEmail,
    subject: "Confirm your new email address",
    html: `
      <p>Hi,</p>
      <p>You requested to change your sign-in email address to <strong>${newEmail}</strong>.</p>
      <p>Click the link below to confirm. The link expires in 24 hours.</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>If you did not request this change, you can safely ignore this email.</p>
    `,
    text: `Confirm your email change: ${verifyUrl}\n\nExpires in 24 hours. If you did not request this, ignore this email.`,
    templateKey: "email_change_verify",
  });

  await recordAudit({
    action: AUDIT_ACTIONS.USER_EMAIL_CHANGE_REQUESTED,
    resourceType: "user",
    resourceId: session.user.id,
    metadata: { newEmail },
  });

  revalidatePath("/account");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// cancelEmailChange
// ---------------------------------------------------------------------------

export async function cancelEmailChange(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthorized." };

  await db
    .delete(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, session.user.id));

  await recordAudit({
    action: AUDIT_ACTIONS.USER_EMAIL_CHANGE_CANCELLED,
    resourceType: "user",
    resourceId: session.user.id,
  });

  revalidatePath("/account");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// changePassword
// ---------------------------------------------------------------------------

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthorized." };

  // Fetch stored hash from DB — never trust session for this
  const userRow = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { password: true },
  });

  if (!userRow?.password) {
    return { ok: false, error: "No password is set on this account." };
  }

  const matches = await compare(input.currentPassword, userRow.password);
  if (!matches) {
    return { ok: false, error: "Current password is incorrect." };
  }

  if (input.newPassword.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }

  const hashed = await hash(input.newPassword, 10);
  await db
    .update(users)
    // Clearing mustChangePassword here is what releases a first-login /
    // admin-reset user from the forced /change-password gate (the shared
    // post-sign-in resolver and proxy.ts both key on that claim).
    .set({ password: hashed, mustChangePassword: false })
    .where(eq(users.id, session.user.id));

  // Invalidate any in-flight password reset tokens for this user now that the
  // password has been changed via the account settings page.
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, session.user.id));

  await recordAudit({
    action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
    resourceType: "user",
    resourceId: session.user.id,
  });

  // NOTE (Gap 5): No rate limiting on failed password-change attempts. An
  // attacker with a stolen session token could brute-force the current
  // password. Production forks should add a rate-limit library (e.g.
  // @upstash/ratelimit) or a failed-attempt counter.

  revalidatePath("/account");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// requestAccountDeletion — STUB
// ---------------------------------------------------------------------------

export async function requestAccountDeletion(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthorized." };

  await recordAudit({
    action: AUDIT_ACTIONS.USER_DELETION_REQUESTED,
    resourceType: "user",
    resourceId: session.user.id,
    metadata: { stub: true },
  });

  // TODO: Replace this stub with a real deletion flow.
  //
  // CONSTRAINT (DECISION-015): the starter's signIn gate keys OAuth lookups off
  // the user's email address. If a user row is hard-deleted, a deactivated user
  // could re-register via Google OAuth (no row → adapter creates a fresh one).
  // The mandated deletion strategy is therefore SOFT DEACTIVATION (isActive=false),
  // NOT hard-delete. A hard-delete implementation must also add a `deleted_emails`
  // blocklist (or equivalent) to preserve the OAuth re-registration block.
  //
  // Implementation shape for soft-deactivation:
  //   await db.update(users).set({ isActive: false }).where(eq(users.id, userId));
  //   await signOut({ redirect: false });
  //
  // The proxy already blocks deactivated users (isActive check on every request);
  // the stale-JWT defense in the jwt callback evicts the token on next request.

  return {
    ok: true,
    data: undefined,
  };
}
