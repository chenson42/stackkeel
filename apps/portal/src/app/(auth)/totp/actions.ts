"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { auth, unstable_update } from "@/auth";
import { db } from "@/lib/db";
import {
  userTotp,
  userTotpRecoveryCodes,
} from "@/lib/db/schema";
import {
  decryptSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyToken,
  TotpSecretUndecryptableError,
} from "@/lib/two-factor";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeCallbackUrl } from "@/lib/auth/safe-callback";
import type { AuthFormResult } from "@repo/ui";

export interface VerifyTotpInput {
  code: string;
  callbackUrl: string;
}

const INVALID_CODE_ERROR =
  "That code didn't match. Try again, or use a recovery code.";
const RATE_LIMITED_ERROR =
  "Too many attempts. Please wait a moment before trying again.";

/**
 * The stored secret can no longer be decrypted — normally because
 * AUTH_TOTP_ENCRYPTION_KEY was rotated after this user enrolled. No
 * authenticator code will ever match, so INVALID_CODE_ERROR's "try again"
 * would loop the person forever. Recovery codes are checked separately and
 * still work, so this message points at them first.
 */
const UNDECRYPTABLE_SECRET_ERROR =
  "Your saved authenticator setup can no longer be read, so codes from your " +
  "authenticator app won't work. Use a recovery code to sign in, or ask an " +
  "administrator to reset two-factor for your account. This is not something " +
  "you did wrong.";

/**
 * Verifies a submitted 6-digit TOTP code or an XXXX-XXXX recovery code
 * against the signed-in (but not-yet-2FA-verified) session, and flips
 * `twoFactorVerified` on success.
 *
 * Signature changed from the pre-refactor `verifyTotpAction(formData):
 * Promise<void>` (always-redirects, error state carried via a `?error=`
 * query param) to this `AuthFormResult`-returning shape so it can be
 * consumed by @repo/ui's `TotpVerifyForm` — per
 * apps/portal/docs/work-log/2026-09-04-shared-login-component.md, Phase 3
 * Component/Page Plan, Increment B step 5. Internal logic (rate limit,
 * audit, recovery-code lookup) is preserved verbatim; only the outer
 * signature and the failure path's transport changed (redirect-with-query
 * → returned {error}).
 */
export async function verifyTotp(
  input: VerifyTotpInput,
): Promise<AuthFormResult> {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const callbackUrl = sanitizeCallbackUrl(input.callbackUrl);

  const enrollment = await db.query.userTotp.findFirst({
    where: eq(userTotp.userId, session.user.id),
  });
  if (!enrollment) redirect("/account/2fa");

  // Rate limit: 10/min by userId. The UX copy is intentionally vague ("wait
  // a moment") for the short 1-minute window; retryAfterSeconds is not
  // surfaced.
  const limited = await checkRateLimit(
    `totp:${session.user.id}`,
    { max: 10, windowSeconds: 60 },
    {
      userId: session.user.id,
      actor: session.user.email ?? session.user.id,
      reason: "totp_verify",
    },
  );
  if (!limited.allowed) {
    return { error: RATE_LIMITED_ERROR };
  }

  const trimmed = input.code.trim();
  const isSixDigit = /^\d{6}$/.test(trimmed);

  // Explicit actor: session is already resolved above; passing it avoids a
  // second auth() call inside recordAudit() (Gap 5 resolution from Phase 1).
  const actor = { userId: session.user.id, email: session.user.email ?? null };

  if (isSixDigit) {
    let plainSecret: string;
    try {
      plainSecret = decryptSecret(enrollment.secretCiphertext);
    } catch (err) {
      if (!(err instanceof TotpSecretUndecryptableError)) throw err;
      await recordAudit({
        action: AUDIT_ACTIONS.TOTP_VERIFY_FAILED,
        actor,
        resourceType: "user",
        resourceId: session.user.id,
        metadata: { reason: "secret_undecryptable" },
      });
      return { error: UNDECRYPTABLE_SECRET_ERROR };
    }

    const ok = verifyToken(trimmed, plainSecret);
    if (!ok) {
      await recordAudit({
        action: AUDIT_ACTIONS.TOTP_VERIFY_FAILED,
        actor,
        resourceType: "user",
        resourceId: session.user.id,
      });
      return { error: INVALID_CODE_ERROR };
    }
    await db
      .update(userTotp)
      .set({ lastUsedAt: new Date() })
      .where(eq(userTotp.userId, session.user.id));
    await recordAudit({
      action: AUDIT_ACTIONS.TOTP_VERIFY_SUCCEEDED,
      actor,
      resourceType: "user",
      resourceId: session.user.id,
    });
    await unstable_update({ user: { twoFactorVerified: true } });
    redirect(callbackUrl);
  }

  // Try as recovery code.
  const normalized = normalizeRecoveryCode(trimmed);
  if (!normalized) {
    await recordAudit({
      action: AUDIT_ACTIONS.TOTP_VERIFY_FAILED,
      actor,
      resourceType: "user",
      resourceId: session.user.id,
      metadata: { reason: "malformed_input" },
    });
    return { error: INVALID_CODE_ERROR };
  }
  const hash = hashRecoveryCode(normalized);
  const match = await db.query.userTotpRecoveryCodes.findFirst({
    where: and(
      eq(userTotpRecoveryCodes.userId, session.user.id),
      eq(userTotpRecoveryCodes.codeHash, hash),
      isNull(userTotpRecoveryCodes.usedAt),
    ),
  });
  if (!match) {
    await recordAudit({
      action: AUDIT_ACTIONS.TOTP_RECOVERY_FAILED,
      actor,
      resourceType: "user",
      resourceId: session.user.id,
    });
    return { error: INVALID_CODE_ERROR };
  }
  await db
    .update(userTotpRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(eq(userTotpRecoveryCodes.id, match.id));
  await recordAudit({
    action: AUDIT_ACTIONS.TOTP_RECOVERY_SUCCEEDED,
    actor,
    resourceType: "user",
    resourceId: session.user.id,
    metadata: { codeId: match.id },
  });
  await unstable_update({ user: { twoFactorVerified: true } });
  redirect(callbackUrl);
}
