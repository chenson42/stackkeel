"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";
import { db } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { ADMIN_APP_ROLE_NAMES } from "@/lib/admin-app-roles";
import {
  resolvePostSignInDestination,
  sanitizeCallbackUrl,
} from "@/lib/auth/post-signin";

export interface SignInInput {
  email: string;
  password: string;
  /** Omitted / empty on the first (credentials-only) submission. */
  totpCode?: string;
  callbackUrl: string;
}

export type SignInActionResult =
  | { mfaRequired: true }
  | { error: string };

/**
 * Server action wrapper for credentials sign-in. Deliberately mirrors
 * apps/portal/src/app/(auth)/signin/actions.ts's own signInWithCredentials
 * shape and its documented reason for existing: do NOT pass `redirectTo`
 * back to signIn() and let it drive the post-auth redirect directly — a
 * Server-Action-driven redirect does not reliably trigger a fresh
 * proxy.ts (Middleware) invocation, so an unenrolled/zero-role user could
 * land straight on a gated route. See src/lib/auth/post-signin.ts's header
 * for the full root-cause pointer
 * (docs/work-log/2026-09-03-2fa-gate-bypass.md).
 *
 * Instead: sign in with `redirect: false`, then look up the fresh
 * role/hasTotp state directly (the same DB read `jwt()` would do on the
 * next request anyway) and decide the real destination via
 * resolvePostSignInDestination() before this action performs its own
 * redirect.
 */
export async function signInWithCredentials(
  input: SignInInput,
): Promise<SignInActionResult | undefined> {
  try {
    await signIn("credentials", {
      email: input.email,
      password: input.password,
      totpCode: input.totpCode ?? "",
      redirect: false,
    });
  } catch (err) {
    // MFA_REQUIRED (2026-09-04 fix, docs/work-log/2026-09-04-totp-per-
    // login-gap.md): correct password, TOTP enrolled, no code submitted
    // yet — NOT a failed login. Signal the client to render the code-entry
    // step instead of an error. See apps/admin/src/auth.ts's authorize()
    // for where this is thrown.
    if (err instanceof CredentialsSignin && err.code === "MFA_REQUIRED") {
      return { mfaRequired: true };
    }
    // The stored TOTP secret can no longer be decrypted — normally because
    // AUTH_TOTP_ENCRYPTION_KEY was rotated after this user enrolled. No code
    // from their authenticator will ever match, so "invalid code" would be
    // both wrong and unactionable.
    if (err instanceof CredentialsSignin && err.code === "MFA_UNREADABLE") {
      return {
        error:
          "Two-factor authentication needs to be set up again on this account. " +
          "Your saved authenticator setup can no longer be read, so no code from " +
          "it will work. This is not something you did wrong — ask another " +
          "administrator to reset two-factor for your account.",
      };
    }
    if (err instanceof AuthError) {
      return {
        error: input.totpCode
          ? "Invalid authentication code. Please try again."
          : "Wrong email or password.",
      };
    }
    throw err;
  }

  const email = input.email.toLowerCase();
  const dbUser = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  });

  let hasAdminAppRole = false;
  let hasTotp = false;
  if (dbUser) {
    const roleRows = await db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, dbUser.id));
    hasAdminAppRole = roleRows.some((r) =>
      (ADMIN_APP_ROLE_NAMES as readonly string[]).includes(r.name),
    );

    const totpRow = await db.query.userTotp.findFirst({
      where: (t, { eq: eqOp }) => eqOp(t.userId, dbUser.id),
      columns: { userId: true },
    });
    hasTotp = !!totpRow;
  }

  redirect(
    resolvePostSignInDestination(
      { hasAdminAppRole, hasTotp },
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

/**
 * Extracted from an inline server-action closure that used to live directly
 * in page.tsx (2026-09-04 fix, docs/work-log/2026-09-04-totp-per-login-
 * gap.md) — page.tsx is now a thin server wrapper and AdminSignInForm
 * (2026-09-04-shared-login-component, Increment C) owns the whole Card
 * across both steps, so this needs to be an importable/bindable "use
 * server" export rather than a closure a Server Component defines at
 * render time.
 *
 * Google's own redirect is a real HTTP 302 from
 * /api/auth/callback/google — unlike the credentials path above, it DOES
 * trigger a fresh proxy.ts pass on the client's next request, so no
 * resolvePostSignInDestination() detour is needed here.
 */
export async function signInWithGoogle(callbackUrl: string): Promise<void> {
  await signIn("google", { redirectTo: callbackUrl });
}
