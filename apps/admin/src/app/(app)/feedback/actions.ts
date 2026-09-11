"use server";
import "server-only";

import { eq } from "drizzle-orm";
import { validateFeedbackTransition } from "@repo/db";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { FEATURES, hasFeature } from "@repo/permissions";
import type { ActionResult } from "@/types/actions";

// Cross-app feedback triage (Increment 6, step 6a —
// apps/portal/docs/work-log/2026-09-06-feedback-admin-triage.md). Literal
// shape from that work-log's own API Contract — see root docs/decisions.md
// DECISION-016 for why validateFeedbackTransition() lives in packages/db
// (pure, no side effect) while the actual UPDATE call stays here, in
// this app's own action file, directly preceded by its own audit-exempt
// comment: check:audit's heuristic only exempts a mutation whose
// immediately preceding source line is that comment, so moving the real
// UPDATE into packages/db would make this file's own tripwire see no
// mutation at all to examine. The mutation itself is exempted from
// check:audit (same judgment Portal's own now-deleted updateFeedbackStatus
// made — root docs/decisions.md DECISION-014 §2: an operator triage
// mutation is not a user-access or security-sensitive change; no precedent
// anywhere in this monorepo audits this class of mutation).
//
// A client-suppliable feedbackId is correct here, unlike Increment 5's
// zero-parameter getMyFeedback() — this action's whole purpose is an
// already-authorized admin mutating ANY row, with no per-row ownership
// predicate to derive. The authorization boundary is entirely the
// hasFeature() check below, exercised once per call.
export async function updateFeedbackStatus(
  feedbackId: string,
  newStatus: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  if (!hasFeature(session.user.features, FEATURES.ADMIN_FEEDBACK)) {
    return { ok: false, error: "Forbidden." };
  }

  const check = await validateFeedbackTransition(db, feedbackId, newStatus);
  if (!check.ok) return check;

  // audit-exempt: operator triage mutation; not a user-access or security-sensitive change
  await db
    .update(schema.feedback)
    .set({ status: newStatus })
    .where(eq(schema.feedback.id, feedbackId));

  return { ok: true };
}
