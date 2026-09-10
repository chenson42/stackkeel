export interface SignInUser {
  id?: string | null;
  email?: string | null;
}

export interface SignInAccount {
  provider?: string | null;
}

export interface ActiveUserRow {
  isActive: boolean;
}

export type FindActiveUser = (key: {
  by: "id" | "email";
  value: string;
}) => Promise<ActiveUserRow | null | undefined>;

/**
 * Minimal invite record returned by the invite lookup dependency.
 * Only the fields the gate needs to make its allow/block decision.
 */
export interface ValidInviteRow {
  id: string;
  email: string;
}

/**
 * Dependency-injected invite lookup used by the OAuth branch of isSignInAllowed.
 * Returns a non-revoked invite whose email matches the one being signed in with,
 * or null if no such invite exists.
 *
 * In production this reads the app's invite table; in tests it is mocked.
 */
export type FindValidInvite = (
  email: string,
) => Promise<ValidInviteRow | null | undefined>;

/**
 * Decide whether a sign-in attempt is allowed, returned by the NextAuth
 * `signIn` callback.
 *
 * Auth.js hands the callback a DIFFERENT `user` shape per provider type, which
 * is the entire reason this logic is subtle:
 *
 * - **Credentials:** `user.id` is the database id returned by the provider's
 *   `authorize()`. Block if the row is missing or inactive — this is the only
 *   thing stopping a deleted/deactivated user from re-using a still-valid
 *   session to sign back in.
 *
 * - **OAuth (Google):** on the FIRST sign-in the account is not yet linked, so
 *   Auth.js passes the *provider profile* — whose `id` is the provider's `sub`,
 *   NOT a database id (see `@auth/core` callback: `userByAccount ?? userFromProvider`).
 *   Looking that `sub` up against the `uuid` id column throws, which Auth.js
 *   surfaces as `AccessDenied` — so a naive `eq(users.id, user.id)` blocks
 *   EVERY first-time Google login. We gate on the verified email instead.
 *   Google verifies email ownership, so email matching is safe and is exactly
 *   what `allowDangerousEmailAccountLinking` uses to link the account.
 *
 *   When the deployment is invite-gated (closed beta), OAuth may sign in
 *   an account if:
 *   (a) an active user row already exists for the email, OR
 *   (b) a valid, non-revoked invite is bound to the email (brand-new user).
 *   Uninvited strangers with no existing account are blocked.
 *
 *   The `findValidInvite` parameter is optional; when omitted the gate
 *   uses "existing-account-only" behaviour — the right shape for a
 *   deployment with open or admin-invite-only signup.
 */
export async function isSignInAllowed(
  params: { user: SignInUser; account?: SignInAccount | null },
  findActiveUser: FindActiveUser,
  findValidInvite?: FindValidInvite,
): Promise<boolean> {
  const { user, account } = params;

  if (account?.provider === "credentials") {
    if (!user.id) return false;
    const row = await findActiveUser({ by: "id", value: user.id });
    return !!row && row.isActive;
  }

  // OAuth (and any other non-credentials provider): match by verified email,
  // never by the provider profile id.
  const email = user.email?.trim().toLowerCase();
  if (!email) return false;

  // Check for an existing active account first (the common case for returning
  // users who already have a password or linked Google account).
  const row = await findActiveUser({ by: "email", value: email });
  if (row) return row.isActive;

  // No existing account. Allow sign-in only if a valid invite exists for this
  // email — this is the new-user-via-Google path. The invite is re-validated
  // against the DB here; the cookie is the *transport*, not the authority.
  if (findValidInvite) {
    const invite = await findValidInvite(email);
    if (invite) return true;
  }

  // No account, no valid invite → closed beta blocks this sign-in.
  return false;
}
