"use server";

import { eq } from "drizzle-orm";
import { auth, unstable_update } from "@/auth";
import { db } from "@/lib/db";
import { userTotp, userTotpRecoveryCodes } from "@/lib/db/schema";
import { encryptSecret, verifyToken, generateRecoveryCodes, hashRecoveryCode } from "@repo/auth/two-factor";
import { clearPendingEnrollment, getPendingSecret } from "@repo/auth/totp-pending";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import type { ActionResult } from "@/types/actions";

/**
 * completeTotpEnrollmentAction — mirrors
 * apps/portal/src/app/(account)/account/2fa/actions.ts's completeEnrollment
 * shape: decrypt the server-held pending secret (never trust a
 * client-posted secret), verify the submitted code, persist the confirmed
 * userTotp row, generate recovery codes, delete the pending row.
 *
 * Increment 1 of the 2FA consolidation (2026-09-07): the pending-row
 * read/expiry-check/decrypt sequence used to be inlined here, duplicating
 * what a predecessor app's own totp-pending.ts already encapsulated. Now delegates to
 * the shared getPendingSecret()/clearPendingEnrollment() (promoted to
 * packages/auth, db-injected).
 *
 * SECOND FIX within Increment 2, found by actually running the e2e gate
 * (not assumed): this action used to call unstable_update({}) itself,
 * immediately after the DB writes. That call sets the session cookie —
 * and, exactly like Portal's original recovery-code display bug (Phase 3's
 * own analysis), a Server Action that writes a cookie triggers Next's
 * automatic post-action RSC refresh of the current route REGARDLESS of any
 * explicit revalidatePath call. Before this file's Increment 2 hasTotp
 * guard existed, page.tsx unconditionally rendered <MfaSetupForm> either
 * way, so the refresh was harmless — same component, same position, React
 * preserved its local `recoveryCodes` state across the refresh. Once the
 * guard made page.tsx's render depend on the userTotp row this action had
 * JUST inserted, the automatic refresh started rendering the "Already
 * enrolled" branch INSTEAD of <MfaSetupForm> — a different component at
 * that position, forcing React to unmount the form (and its just-set
 * `recoveryCodes` state) before the user ever saw the codes. Caught by
 * `apps/admin/e2e/auth-and-admin-smoke.spec.ts`'s own pre-existing
 * enrollment test failing with "Save your recovery codes" never appearing
 * — the exact same failure signature Portal's bug produced, on a suite
 * this diff did not intend to touch that assertion in.
 *
 * Fix: same shape as Portal's. unstable_update({}) is no longer called
 * here — it moves to acknowledgeTotpEnrollmentAction(), below, fired only
 * from the Continue button's click handler after the user has already seen
 * the codes on screen. Nothing writes the session cookie (and therefore
 * nothing triggers the automatic refresh) until the user has moved on.
 */
export async function completeTotpEnrollmentAction(input: {
  code: string;
}): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthorized." };

  // Increment 2 (2026-09-07) — defense in depth against a direct POST
  // bypassing page.tsx's own hasTotp guard. Without this, an already-
  // enrolled admin could reach this action directly and have
  // completeTotpEnrollmentAction unconditionally delete + re-insert
  // userTotpRecoveryCodes, invalidating recovery codes they already hold
  // with no confirmation. Same one-line shape a predecessor app's own
  // POST /api/mfa/verify already uses.
  if (session.user.hasTotp) {
    return { ok: false, error: "MFA is already enabled." };
  }

  const secret = await getPendingSecret(db, session.user.id);
  if (!secret) {
    return { ok: false, error: "No pending enrollment found. Reload the page to start over." };
  }

  if (!verifyToken(input.code, secret)) {
    return { ok: false, error: "That code did not match. Try again." };
  }

  await db
    .insert(userTotp)
    .values({ userId: session.user.id, secretCiphertext: encryptSecret(secret) })
    .onConflictDoUpdate({
      target: userTotp.userId,
      set: { secretCiphertext: encryptSecret(secret), enrolledAt: new Date(), lastUsedAt: null },
    });

  await clearPendingEnrollment(db, session.user.id);

  const codes = generateRecoveryCodes();
  await db.delete(userTotpRecoveryCodes).where(eq(userTotpRecoveryCodes.userId, session.user.id));
  await db
    .insert(userTotpRecoveryCodes)
    .values(codes.map((c) => ({ userId: session.user.id, codeHash: hashRecoveryCode(c) })));

  await recordAudit({
    action: AUDIT_ACTIONS.TOTP_ENROLLED,
    resourceType: "user",
    resourceId: session.user.id,
  });

  return { ok: true, data: { recoveryCodes: codes } };
}

/**
 * acknowledgeTotpEnrollmentAction — fired from MfaSetupForm's Continue
 * button, AFTER the user has read their recovery codes. Performs the one
 * remaining step completeTotpEnrollmentAction used to do inline: force a
 * fresh JWT sign with the now-true hasTotp claim, via the SAME mechanism
 * apps/portal/src/app/(admin)/admin/users/actions.ts's refreshSelfIfNeeded
 * uses — so src/proxy.ts's edge-decoded cookie reads hasTotp: true on the
 * very next request instead of bouncing back to /setup-mfa. hasTotp IS
 * recomputed unconditionally by computeSharedJwtClaims on every jwt()
 * invocation, but that recomputation only reaches the browser's cookie
 * when something actually triggers a fresh sign of the JWT; a plain RSC
 * auth() read does not re-issue Set-Cookie on its own.
 *
 * Deliberately no DB write and no `code`/input argument — this only
 * touches the session cookie. See completeTotpEnrollmentAction's own
 * header for why this split exists.
 */
export async function acknowledgeTotpEnrollmentAction(): Promise<void> {
  const session = await auth();
  if (!session?.user) return;

  await unstable_update({});
}
