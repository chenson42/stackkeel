"use server";

import { eq } from "drizzle-orm";
import { compare, hash } from "bcryptjs";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users, feedback } from "@/lib/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { getRequestIp } from "@/lib/request-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { isFlagEnabled } from "@/lib/flags";
import { getFeedbackByUserId } from "@repo/db";
import type { ActionResult } from "@/types/actions";
import type { FeedbackFormValues, MyFeedbackItem } from "@repo/ui";

// Self-serve password change (2026-09-05-account-menu-restructure Increment
// B). Admin had NO self-serve password flow before this — only
// /set-password, which consumes a one-time invite token — so an admin could
// never rotate their own password once enrolled. That gap is why this app
// was the one of three with nothing behind "Account settings".
//
// Deliberately mirrors apps/portal/src/app/(account)/account/actions.ts's
// changePassword rather than inventing a new shape: verify the CURRENT
// password before writing (so a stolen session cannot silently rotate the
// password and lock the real owner out), rate-limit by user id, and write an
// audit row. Rate limiting matters more here than on a read: without it this
// endpoint is a password oracle — an attacker with a session could brute-
// force the current password via the "Current password is incorrect" error.
const MIN_PASSWORD_LENGTH = 8;

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You are not signed in." };
  }

  const ip = getRequestIp(await headers());
  const limited = await checkRateLimit(
    `change-password:${session.user.id}`,
    { max: 5, windowSeconds: 300 },
    {
      userId: session.user.id,
      actor: session.user.email ?? session.user.id,
      reason: "change_password",
    },
  );
  if (!limited.allowed) {
    return { ok: false, error: "Too many attempts. Please try again shortly." };
  }

  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (input.newPassword === input.currentPassword) {
    return { ok: false, error: "Your new password must be different." };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { id: true, password: true, email: true },
  });

  // A Google-only account has no password to verify against, so there is
  // nothing to "change" — say so plainly rather than failing as if the
  // current password were wrong.
  if (!user?.password) {
    return {
      ok: false,
      error: "This account signs in with Google and has no password to change.",
    };
  }

  const valid = await compare(input.currentPassword, user.password);
  if (!valid) {
    return { ok: false, error: "Current password is incorrect." };
  }

  await db
    .update(users)
    .set({ password: await hash(input.newPassword, 10), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  await recordAudit({
    action: AUDIT_ACTIONS.ADMIN_PASSWORD_CHANGED,
    resourceType: "user",
    resourceId: user.id,
    metadata: { ip },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// submitFeedback
// ---------------------------------------------------------------------------

// Cross-app feedback capture, Increment 4 of the umbrella
// (apps/portal/docs/work-log/2026-09-06-cross-app-feedback.md). Reproduces
// Portal's submitFeedback (apps/portal/src/app/(member)/feedback/actions.ts)
// server-side validation verbatim — client validation in the shared
// FeedbackForm (@repo/ui) is UX only, never trusted alone. Deliberately
// narrower than Portal's version: no feedbackPromptState upsert (Portal-only
// daily-prompt mechanism; Admin has no prompt card) and no admin
// notification email — see this feature's own work-log,
// a predecessor app/docs/work-log/2026-09-06-feedback-capture-a predecessor app-admin.md,
// Phase 3 Summary.

const VALID_FEEDBACK_CATEGORIES = ["suggestion", "bug", "other"] as const;

/**
 * Submit in-app feedback from any authenticated Admin user.
 * Gate: session.user.id must exist (no feature gate — any signed-in user,
 * same as Portal's and a predecessor app's submitFeedback).
 * Rate-limited: 5 submissions per hour per user (key: feedback:${userId}).
 */
export async function submitFeedback(
  input: FeedbackFormValues,
): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  const limited = await checkRateLimit(
    `feedback:${session.user.id}`,
    { max: 5, windowSeconds: 3600 },
    {
      userId: session.user.id,
      actor: session.user.email ?? session.user.id,
      reason: "feedback_submission",
    },
  );
  if (!limited.allowed) {
    return { ok: false, error: "Too many submissions — come back in a bit." };
  }

  // Body validation.
  const trimmedBody = input.body.trim();
  if (trimmedBody.length < 1) {
    return { ok: false, error: "Say something first." };
  }
  if (trimmedBody.length > 2000) {
    return { ok: false, error: "Feedback must be 2,000 characters or fewer." };
  }

  // Category allowlist.
  if (
    input.category !== null &&
    !(VALID_FEEDBACK_CATEGORIES as readonly string[]).includes(input.category)
  ) {
    return { ok: false, error: "Invalid category." };
  }

  // Bug-only metadata — stripped when category !== 'bug'.
  const contextPath =
    input.category === "bug"
      ? (input.contextPath ?? "").slice(0, 512) || null
      : null;
  const appVersion =
    input.category === "bug"
      ? (input.appVersion ?? "").slice(0, 32) || null
      : null;

  // audit-exempt: personal-data submission; rate-limited; not a security-sensitive mutation
  const [row] = await db
    .insert(feedback)
    .values({
      userId: session.user.id,
      app: "admin", // required, no schema default — feedback is a shared table
      category: input.category,
      body: trimmedBody,
      contextPath,
      appVersion,
    })
    .returning({ id: feedback.id });

  return { ok: true, data: { id: row.id } };
}

// ---------------------------------------------------------------------------
// getMyFeedback
// ---------------------------------------------------------------------------

// "My feedback" self-status view, Increment 5 of the umbrella
// (apps/portal/docs/work-log/2026-09-06-feedback-status-view.md). Behind
// feedback.status_view (root docs/decisions.md DECISION-015), seeded OFF.

/**
 * Return the signed-in user's own feedback, across every app, most recent
 * first. ZERO parameters for whose rows to return — the id comes only from
 * this call's own auth(), never from an argument, a route param, or any
 * client-supplied value. Umbrella Phase 2 §2 / root DECISION-014.
 */
export async function getMyFeedback(): Promise<ActionResult<MyFeedbackItem[]>> {
  if (!(await isFlagEnabled("feedback.status_view"))) {
    return { ok: false, error: "This isn't available yet." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  const rows = await getFeedbackByUserId(db, session.user.id);
  return {
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      app: row.app,
      category: row.category,
      body: row.body,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
