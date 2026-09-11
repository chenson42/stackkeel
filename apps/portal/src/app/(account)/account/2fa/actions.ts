"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth, unstable_update } from "@/auth";
import { db } from "@/lib/db";
import { userTotp, userTotpRecoveryCodes } from "@/lib/db/schema";
import {
  encryptSecret,
  FRESH_RECOVERY_CODES_COOKIE,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyToken,
} from "@/lib/two-factor";
import { clearPendingEnrollment, getPendingSecret } from "@repo/auth/totp-pending";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import type { ActionResult } from "@/types/actions";

const FRESH_COOKIE_TTL_SECONDS = 300; // 5 minutes — enough to copy/paste

async function setFreshRecoveryCodesCookie(codes: string[]) {
  const jar = await cookies();
  jar.set(FRESH_RECOVERY_CODES_COOKIE, JSON.stringify(codes), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: FRESH_COOKIE_TTL_SECONDS,
    path: "/account/2fa",
  });
}

async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await db
    .delete(userTotpRecoveryCodes)
    .where(eq(userTotpRecoveryCodes.userId, userId));
  await db.insert(userTotpRecoveryCodes).values(
    codes.map((c) => ({
      userId,
      codeHash: hashRecoveryCode(c),
    })),
  );
  return codes;
}

// ---------------------------------------------------------------------------
// clearFreshCodesCookieAction — called by the FreshRecoveryCodes client island
// after it mounts and the codes are visible to the user. Running the delete
// here (in a server action) is the only way to mutate cookies legally in
// Next 16; doing it in an RSC render was the source of BUG-2.
// ---------------------------------------------------------------------------

export async function clearFreshCodesCookieAction() {
  const jar = await cookies();
  // Path must match the path used when the cookie was SET in setFreshRecoveryCodesCookie.
  // A deletion sent without the matching Path attribute targets a different cookie
  // entry in the browser jar and silently fails.
  jar.delete({ name: FRESH_RECOVERY_CODES_COOKIE, path: "/account/2fa" });
}

// ---------------------------------------------------------------------------
// completeEnrollment — called from the client TOTP form
//
// Increment 1 of the 2FA consolidation (2026-09-07): the pending-row
// read/expiry-check/decrypt sequence used to be inlined here, duplicating
// what a predecessor app's own totp-pending.ts already encapsulated. Now delegates to
// the shared getPendingSecret()/clearPendingEnrollment() (promoted to
// packages/auth, db-injected). `prepareEnrollment()` — a near-duplicate of
// getOrCreatePendingEnrollment with strictly worse behavior (unconditional
// re-mint, no reuse-if-valid branch) and zero callers — is deleted, not kept.
//
// Increment 2's remount fix: this action no longer calls
// unstable_update()/revalidatePath()/sets the fresh-codes cookie. Those
// calls used to trigger Next's automatic post-Server-Action RSC refetch,
// which swapped page.tsx's branch on `existing` (now truthy) and unmounted
// TotpEnrollForm's local `enrolled`/`recoveryCodes` state before the user
// ever saw the codes — the account-settings audit's Phase 5 finding,
// confirmed via a real browser + a direct psql count showing the codes were
// generated and stored but never rendered. The fix changes WHEN the
// server-driven refresh happens relative to the client seeing the codes: no
// cookie either — the fresh-codes cookie mechanism existed specifically to
// survive the remount this fix removes, so it has no job to do on the
// enrolment path anymore (still used by regenerateRecoveryCodes below, whose
// path has no remount hazard).
// ---------------------------------------------------------------------------

export async function completeEnrollment(input: {
  code: string;
}): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthorized." };

  const secret = await getPendingSecret(db, session.user.id);
  if (!secret) {
    return {
      ok: false,
      error: "No pending enrollment found. Reload the page to start over.",
    };
  }

  if (!verifyToken(input.code, secret)) {
    return { ok: false, error: "That code did not match. Try again." };
  }

  // Store confirmed secret. Re-encrypted (rather than reusing the pending
  // row's own ciphertext) because getPendingSecret() only returns the
  // decrypted plaintext, not the ciphertext — same net effect, one fewer
  // field to thread through the shared module's return type.
  await db
    .insert(userTotp)
    .values({
      userId: session.user.id,
      secretCiphertext: encryptSecret(secret),
    })
    .onConflictDoUpdate({
      target: userTotp.userId,
      set: {
        secretCiphertext: encryptSecret(secret),
        enrolledAt: new Date(),
        lastUsedAt: null,
      },
    });

  await clearPendingEnrollment(db, session.user.id);

  const freshCodes = await replaceRecoveryCodes(session.user.id);

  await recordAudit({
    action: AUDIT_ACTIONS.TOTP_ENROLLED,
    resourceType: "user",
    resourceId: session.user.id,
  });

  return { ok: true, data: { recoveryCodes: freshCodes } };
}

// ---------------------------------------------------------------------------
// acknowledgeEnrollment — called from TotpEnrollForm's `enrolled` branch via
// a useEffect keyed on `enrolled` becoming true, i.e. AFTER the recovery
// codes have already rendered and the user has seen them. Performs exactly
// the two calls completeEnrollment used to do inline: mark the session
// two-factor-verified (same defect class Chris hit on a predecessor app 2026-09-06 —
// here it was scoped to /admin/* so it surfaced later rather than
// instantly, same missing update either way) and refresh the route so a
// reload lands on the server-rendered management view instead of a stale
// enrollment form.
// ---------------------------------------------------------------------------

export async function acknowledgeEnrollment(): Promise<void> {
  const session = await auth();
  if (!session?.user) return;

  await unstable_update({ user: { twoFactorVerified: true } });
  revalidatePath("/account/2fa");
}

// ---------------------------------------------------------------------------
// regenerateRecoveryCodes
// ---------------------------------------------------------------------------

export async function regenerateRecoveryCodes(): Promise<
  ActionResult<{ recoveryCodes: string[] }>
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthorized." };

  const enrolled = await db.query.userTotp.findFirst({
    where: eq(userTotp.userId, session.user.id),
    columns: { userId: true },
  });
  if (!enrolled) {
    return {
      ok: false,
      error: "Enroll in 2FA before regenerating recovery codes.",
    };
  }

  const freshCodes = await replaceRecoveryCodes(session.user.id);
  await setFreshRecoveryCodesCookie(freshCodes);

  await recordAudit({
    action: AUDIT_ACTIONS.TOTP_RECOVERY_CODES_REGENERATED,
    resourceType: "user",
    resourceId: session.user.id,
  });

  revalidatePath("/account/2fa");
  return { ok: true, data: { recoveryCodes: freshCodes } };
}
