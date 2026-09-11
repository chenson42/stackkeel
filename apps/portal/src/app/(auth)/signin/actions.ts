"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { signIn } from "@/auth";
import { AuthError, CredentialsSignin } from "next-auth";
import { db } from "@/lib/db";
import { users, userTotp } from "@/lib/db/schema";
import { computeEffectiveTwoFactor } from "@/lib/auth/local-login";
import { resolvePostSignInDestination } from "@/lib/auth/two-factor-gate";
import { sanitizeCallbackUrl } from "@/lib/auth/safe-callback";
import { computeSecondFactorPolicy } from "@/lib/auth/second-factor-policy";
import { resolvePortalAtomicPostSignInDestination } from "@/lib/auth/atomic-post-signin";

export interface SignInInput {
  email: string;
  password: string;
  turnstileToken?: string;
  callbackUrl: string;
}

/**
 * LEGACY server action — 2026-09-08 atomic-2FA convergence, Increment 1
 * (client half). This is TODAY's exact `signInWithCredentials` body,
 * renamed verbatim, ZERO logic changes — the flag-off rollback contract
 * (work-log Phase 3 § 8: "flag off = today's behavior, byte-identical") is
 * a property of this function being untouched, not just behaviorally
 * equivalent. Wired to `signin/page.tsx`'s flag-off branch, via
 * `PortalCredentialsSignInForm`'s existing `onSubmitCredentials` prop —
 * same call site as before the split, only the export name changed.
 *
 * Matches the pattern established in src/app/(auth)/totp/actions.ts
 * (DECISION-021).
 *
 * On success: Next.js catches the NEXT_REDIRECT throw and follows the redirect.
 * On AuthError: returns { error } so the client form can display inline error.
 * On any other error: re-throws (never swallow NEXT_REDIRECT).
 *
 * IMPORTANT — do not pass `redirectTo` back to `signIn()` and let it drive
 * the post-auth redirect directly. That handed a caller-supplied
 * `callbackUrl` (e.g. `/admin`) straight to the client without this action
 * ever checking whether the freshly-authenticated session still requires
 * TOTP verification — a Server-Action-driven redirect does not reliably
 * trigger a fresh Middleware (`src/proxy.ts`) invocation, so an
 * unverified user could land directly on a 2FA-gated route, skipping
 * `/totp` entirely. See docs/work-log/2026-09-03-2fa-gate-bypass.md.
 *
 * Instead: sign in with `redirect: false`, then decide the real destination
 * via `resolvePostSignInDestination()` (the single source of truth shared
 * with `proxy.ts` and the admin layout) before this action performs its own
 * redirect.
 *
 * IMPORTANT — do not do that decision by calling `auth()` again right after
 * `signIn()` in the same action invocation. `signIn()` sets the session
 * cookie on the outgoing response, but `auth()` re-decodes the session from
 * the *incoming* request's headers, which do not reflect a cookie set
 * earlier in the same request/response cycle — verified live, `auth()`
 * returns `undefined` immediately after a successful same-request
 * `signIn()` call. Instead, look up the user's `twoFactorRequired` state
 * directly (the same DB read `jwt()` would do on the next request anyway).
 * `twoFactorVerified` needs no lookup at all: a freshly-authenticated
 * session always starts with `twoFactorVerified = false` (see
 * `src/auth.ts`'s `jwt()` callback — set unconditionally whenever `user.id`
 * is present, i.e. on every fresh sign-in), so there is no prior-session
 * state to reconcile here.
 */
export async function signInWithCredentialsLegacy(
  input: SignInInput,
): Promise<{ error: string } | undefined> {
  try {
    await signIn("credentials", {
      email: input.email,
      password: input.password,
      turnstileToken: input.turnstileToken ?? "",
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      // CredentialsSignin and other NextAuth errors — return a friendly message.
      // Do not re-throw: the client shows the inline error and resets the widget.
      return { error: "Wrong email or password." };
    }
    // Any other error must propagate so Next.js can handle it.
    throw err;
  }

  const email = input.email.toLowerCase();
  const dbUser = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, twoFactorRequired: true, mustChangePassword: true },
  });
  const twoFactorRequired = dbUser
    ? await computeEffectiveTwoFactor(dbUser.twoFactorRequired)
    : false;
  const totpRow = dbUser
    ? await db.query.userTotp.findFirst({
        where: eq(userTotp.userId, dbUser.id),
        columns: { userId: true },
      })
    : null;

  redirect(
    resolvePostSignInDestination(
      {
        twoFactorRequired,
        twoFactorVerified: false,
        hasTotp: !!totpRow,
        mustChangePassword: dbUser?.mustChangePassword ?? false,
      },
      // Increment 0 (2026-09-08-2fa-atomic-convergence.md, Phase 1
      // Adversarial Pass finding 1 / Claims Ledger row 4): this Server
      // Action is directly invocable with an arbitrary payload by anyone
      // who can reach its action reference, not only through the rendered
      // form — the GET-render page.tsx already sanitizes, but that does not
      // protect this call. Re-sanitize here, at the actual enforcement
      // site, instead of trusting the caller-supplied value end to end.
      sanitizeCallbackUrl(input.callbackUrl),
    ),
  );
}

export interface SignInAtomicInput {
  email: string;
  password: string;
  turnstileToken?: string;
  /** Omitted / empty on the first (credentials-only) submission. */
  totpCode?: string;
  callbackUrl: string;
}

export type SignInAtomicResult =
  | { mfaRequired: true }
  | { error: string };

// Duplicated verbatim from src/app/(auth)/totp/actions.ts's own PRIVATE
// consts — not imported, and can't be: that file carries a "use server"
// directive, and Next.js requires every export of a "use server" module to
// be an async Server Action, so a plain string const cannot be exported
// from it. Kept byte-identical to the source (work-log Phase 3 § 3 names
// totp/actions.ts's own copy as the reference text for MFA_UNREADABLE;
// INVALID_CODE_ERROR is reused here for the same reason — Portal's own
// established copy for "your code didn't match," which already points at
// the recovery-code alternative this form's TotpVerifyForm step renders).
const INVALID_CODE_ERROR =
  "That code didn't match. Try again, or use a recovery code.";
const UNDECRYPTABLE_SECRET_ERROR =
  "Your saved authenticator setup can no longer be read, so codes from your " +
  "authenticator app won't work. Use a recovery code to sign in, or ask an " +
  "administrator to reset two-factor for your account. This is not something " +
  "you did wrong.";

/**
 * ATOMIC server action — 2026-09-08 convergence, Increment 1 (client half).
 * Mirrors Admin's own `signInWithCredentials`
 * (apps/admin/src/app/signin/actions.ts) and `signInWithCredentialsLegacy`
 * above for the redirect-safety reasoning (do not pass `redirectTo` to
 * `signIn()` — re-sanitize and resolve the destination here instead).
 * Wired to `signin/page.tsx`'s flag-on branch, consumed by
 * `portal-sign-in-form.tsx`'s two-step client wrapper — BOTH the
 * credentials-only submission and the totpCode-bearing resubmission call
 * this same action, matching `apps/portal/src/auth.ts`'s `authorizeAtomic()`
 * contract (work-log Phase 4 server half, "The contract ux-developer
 * consumes").
 */
export async function signInWithCredentialsAtomic(
  input: SignInAtomicInput,
): Promise<SignInAtomicResult | undefined> {
  try {
    await signIn("credentials", {
      email: input.email,
      password: input.password,
      turnstileToken: input.turnstileToken ?? "",
      totpCode: input.totpCode ?? "",
      redirect: false,
    });
  } catch (err) {
    // Correct password, TOTP enrolled, no code submitted yet — NOT a
    // failed login. Signal the client to render TotpVerifyForm. Mirrors
    // Admin's own MFA_REQUIRED shape verbatim (apps/admin/src/app/signin/
    // actions.ts).
    if (err instanceof CredentialsSignin && err.code === "MFA_REQUIRED") {
      return { mfaRequired: true };
    }
    // The stored TOTP secret can no longer be decrypted — normally because
    // AUTH_TOTP_ENCRYPTION_KEY was rotated after this user enrolled. No
    // code from their authenticator will ever match, so INVALID_CODE_ERROR's
    // "try again" would loop the person forever. Points at the recovery-code
    // path and an admin reset instead — this is NOT something the user did
    // wrong, and the copy says so.
    if (err instanceof CredentialsSignin && err.code === "MFA_UNREADABLE") {
      return { error: UNDECRYPTABLE_SECRET_ERROR };
    }
    if (err instanceof AuthError) {
      // Wrong password, wrong/used code, rate-limited, or auth.local_login
      // off — authorize() returns a generic null for all of these (Phase 4
      // server half's own contract table), so this action can only
      // distinguish "a code was submitted" from "a code was not," not the
      // finer-grained reason. Matches today's Portal /totp UX (same
      // INVALID_CODE_ERROR text) and Admin's own totpCode-presence check.
      return {
        error: input.totpCode ? INVALID_CODE_ERROR : "Wrong email or password.",
      };
    }
    // Any other error must propagate so Next.js can handle it.
    throw err;
  }

  const email = input.email.toLowerCase();
  const dbUser = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  });

  // The just-returned `user` object from signIn() carries no role/feature
  // data (Phase 4 server half's own contract table) — a fresh DB read is
  // required to pick the real post-signin destination, mirroring Admin's
  // own post-`signIn()` fresh-read pattern
  // (apps/admin/src/app/signin/actions.ts:86-124) rather than trusting
  // anything client-supplied.
  const policy = dbUser ? await computeSecondFactorPolicy(db, dbUser.id) : null;

  redirect(
    resolvePortalAtomicPostSignInDestination(
      policy,
      // Same Increment 0 re-sanitization discipline as the LEGACY action
      // above — this Server Action is directly invocable with an arbitrary
      // payload by anyone who can reach its action reference, not only
      // through the rendered form.
      sanitizeCallbackUrl(input.callbackUrl),
    ),
  );
}
