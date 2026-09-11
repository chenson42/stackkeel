"use server";
import "server-only";

import { eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ADMIN_ROLE } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { enqueueEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/email/escape-html";
import { isFlagEnabled } from "@/lib/flags";
import { getFeedbackByUserId } from "@repo/db";
import type { ActionResult } from "@/types/actions";
import type { MyFeedbackItem } from "@repo/ui";
// computeLocalDate lives in date-utils.ts — extracted from this file because
// Next.js 16 Turbopack requires all exports from "use server" files to be
// async Server Actions. Pure utility functions must live in a separate module.
import { computeLocalDate } from "./date-utils";

// ---------------------------------------------------------------------------
// Helper: admin notification email HTML
// ---------------------------------------------------------------------------

/**
 * the platform Admin's own cross-app feedback triage page — the destination for
 * the "View all feedback" link below. Portal's own /admin/feedback was
 * removed entirely 2026-09-06 (Increment 6, step 6b) once Admin's /feedback
 * page shipped and was independently verified live (QA Phase 5,
 * apps/portal/docs/work-log/2026-09-06-feedback-admin-triage.md).
 *
 * Derived from NEXT_PUBLIC_ADMIN_URL — the same env var the cross-app
 * switcher (src/lib/app-switcher.ts) already reads — by replacing whatever
 * path it points at (its own default is .../users) with /feedback. Using
 * new URL()'s absolute-path resolution rather than string concatenation so
 * this doesn't silently produce a double path if the env var's own value
 * ever changes shape.
 */
const ADMIN_FEEDBACK_URL = new URL(
  "/feedback",
  process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3002/users",
).href;

/**
 * Build the HTML body for the admin notification email.
 * ALL member-supplied strings are passed through escapeHtml() before
 * interpolation — this is an XSS invariant that must survive all future
 * edits to this template.
 */
function buildFeedbackEmailHtml(params: {
  body: string;
  category: string | null;
  contextPath: string | null;
  appVersion: string | null;
  submitterName: string;
  submitterEmail: string;
}): string {
  const { body, category, contextPath, appVersion, submitterName, submitterEmail } =
    params;

  // Escape every member-supplied string before HTML interpolation.
  const safeBody = escapeHtml(body);
  const safeName = escapeHtml(submitterName);
  const safeEmail = escapeHtml(submitterEmail);
  const safeCategory = escapeHtml(category ?? "general");
  const safeContextPath = contextPath ? escapeHtml(contextPath) : null;
  const safeAppVersion = appVersion ? escapeHtml(appVersion) : null;

  return [
    `<p><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p>`,
    `<p><strong>Category:</strong> ${safeCategory}</p>`,
    `<p><strong>Message:</strong></p>`,
    `<p style="white-space:pre-wrap">${safeBody}</p>`,
    safeContextPath
      ? `<p><strong>Page:</strong> ${safeContextPath}</p>`
      : "",
    safeAppVersion
      ? `<p><strong>App version:</strong> ${safeAppVersion}</p>`
      : "",
    `<hr />`,
    `<p><a href="${ADMIN_FEEDBACK_URL}">View all feedback &rarr;</a></p>`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Valid categories allowlist
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = ["suggestion", "bug", "other"] as const;

// ---------------------------------------------------------------------------
// submitFeedback
// ---------------------------------------------------------------------------

type SubmitFeedbackInput = {
  body: string;
  category: string | null;
  contextPath: string | null;
  appVersion: string | null;
  tzOffsetMinutes: number | null;
};

/**
 * Submit in-app feedback from any authenticated member.
 * Gate: session.user.id must exist (no feature gate — any signed-in user).
 * Rate-limited: 5 submissions per hour per user (key: feedback:${userId}).
 *
 * Returns { ok: true, data: { id } } on success.
 * Returns { ok: false, error } on validation failure, auth failure, or rate limit.
 * Never throws for email failures — admin notification is fire-and-forget.
 */
export async function submitFeedback(
  input: SubmitFeedbackInput,
): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  // Rate limit: 5 submissions per hour per user.
  const rateLimitResult = await checkRateLimit(
    `feedback:${session.user.id}`,
    { max: 5, windowSeconds: 3600 },
    {
      userId: session.user.id,
      actor: session.user.email ?? session.user.id,
      reason: "feedback submission",
    },
  );
  if (!rateLimitResult.allowed) {
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
    !(VALID_CATEGORIES as readonly string[]).includes(input.category)
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

  const localToday = computeLocalDate(input.tzOffsetMinutes);

  // Insert feedback row.
  // audit-exempt: personal-data submission; rate-limited; not a security-sensitive mutation
  const [row] = await db
    .insert(schema.feedback)
    .values({
      userId: session.user.id,
      app: "portal", // required, no schema default — feedback is now a shared table
      category: input.category,
      body: trimmedBody,
      contextPath,
      appVersion,
    })
    .returning({ id: schema.feedback.id });

  // Upsert feedbackPromptState.lastSubmittedDate.
  // CLOBBER-PREVENTION: sets ONLY lastSubmittedDate. optedOut and lastSnoozedDate are untouched.
  // audit-exempt: personal preference mutation; no security-sensitive surface
  await db
    .insert(schema.feedbackPromptState)
    .values({
      userId: session.user.id,
      lastSubmittedDate: localToday,
      optedOut: false,
      lastSnoozedDate: null,
    })
    .onConflictDoUpdate({
      target: schema.feedbackPromptState.userId,
      set: { lastSubmittedDate: sql`excluded.last_submitted_date` },
    });

  // Admin notification — fire-and-forget; failure never surfaces to the member.
  try {
    const admins = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .innerJoin(
        schema.userRoles,
        eq(schema.userRoles.userId, schema.users.id),
      )
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
      .where(eq(schema.roles.name, ADMIN_ROLE));

    if (admins.length === 0) {
      console.warn("[feedback] No admins found — skipping notification email.");
    } else {
      const safeCategory = escapeHtml(input.category ?? "general");
      for (const admin of admins) {
        await enqueueEmail({
          to: admin.email,
          subject: `New feedback — ${safeCategory}`,
          html: buildFeedbackEmailHtml({
            body: trimmedBody,
            category: input.category,
            contextPath,
            appVersion,
            submitterName: session.user.name ?? "A member",
            submitterEmail: session.user.email ?? "",
          }),
          templateKey: "feedback_notification",
        });
      }
    }
  } catch (err) {
    console.error("[feedback] Admin notification failed:", err);
  }

  return { ok: true, data: { id: row.id } };
}

// ---------------------------------------------------------------------------
// snoozeFeedbackPrompt
// ---------------------------------------------------------------------------

/**
 * Snooze the daily feedback prompt for the current local calendar day.
 * Gate: any authenticated user.
 *
 * CLOBBER-PREVENTION: upserts ONLY lastSnoozedDate.
 * optedOut and lastSubmittedDate are not touched.
 */
export async function snoozeFeedbackPrompt(
  tzOffsetMinutes: number | null,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  const localToday = computeLocalDate(tzOffsetMinutes);

  // CLOBBER-PREVENTION: sets ONLY lastSnoozedDate.
  // audit-exempt: personal preference mutation; no security-sensitive surface
  await db
    .insert(schema.feedbackPromptState)
    .values({
      userId: session.user.id,
      lastSnoozedDate: localToday,
      optedOut: false,
      lastSubmittedDate: null,
    })
    .onConflictDoUpdate({
      target: schema.feedbackPromptState.userId,
      set: { lastSnoozedDate: sql`excluded.last_snoozed_date` },
    });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// setFeedbackOptOut
// ---------------------------------------------------------------------------

/**
 * Set the member's daily prompt opt-out preference.
 * Gate: any authenticated user.
 *
 * Called with optedOut=true to dismiss the daily prompt permanently.
 * Called with optedOut=false to re-enable it from /account settings.
 *
 * CLOBBER-PREVENTION: upserts ONLY optedOut.
 * lastSnoozedDate and lastSubmittedDate are not touched.
 */
export async function setFeedbackOptOut(
  optedOut: boolean,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  // CLOBBER-PREVENTION: sets ONLY optedOut.
  // audit-exempt: personal preference mutation; no security-sensitive surface
  await db
    .insert(schema.feedbackPromptState)
    .values({
      userId: session.user.id,
      optedOut,
      lastSnoozedDate: null,
      lastSubmittedDate: null,
    })
    .onConflictDoUpdate({
      target: schema.feedbackPromptState.userId,
      set: { optedOut: sql`excluded.opted_out` },
    });

  return { ok: true };
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
