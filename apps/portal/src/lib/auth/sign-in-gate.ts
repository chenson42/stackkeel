/**
 * Gate function for the NextAuth signIn callback.
 *
 * WHY this is email-keyed for OAuth (not id-keyed):
 *
 *   Auth.js v5 runs the `signIn` callback *before* the adapter creates a new
 *   user row. On a first-time Google sign-in, `user.id` is Google's `sub`
 *   string (e.g. "117483729384657382910") — not a database UUID. An id-keyed
 *   lookup therefore always misses on first sign-in, causing `!dbUser → false`
 *   and an AccessDenied error for every brand-new OAuth user.
 *
 *   Google verifies email ownership at token issuance, so using `user.email`
 *   as the lookup key is safe for Google OAuth. See DECISION-015 for the full
 *   rationale and the deletion-strategy constraint (soft deactivation only;
 *   hard-delete invalidates the email-keyed gate).
 *
 * @see docs/decisions.md — DECISION-015
 */

export type GateUser = {
  id?: string | null;
  email?: string | null;
};

export type FindUserByEmail = (
  email: string
) => Promise<{ isActive: boolean } | null>;

/**
 * Evaluate whether a signing-in user should be allowed through the NextAuth
 * signIn callback.
 *
 * OAuth branch (provider !== "credentials"):
 *   - no email from provider → false (fail-safe)
 *   - no row (new user)      → true  (adapter will create the row)
 *   - row, isActive = true   → true
 *   - row, isActive = false  → false (deactivated; block)
 *
 * Credentials branch:
 *   - returns true unconditionally.
 *   authorize() has already verified isActive and returned null if the user
 *   was inactive; NextAuth would not have called signIn if authorize()
 *   returned null. A second lookup here is a dead round-trip (see DECISION-015).
 *
 * @param provider        NextAuth provider id ("google", "credentials", etc.)
 * @param user            The user object from the signIn callback
 * @param findUserByEmail Injected DB lookup — receives a lowercased email,
 *                        returns { isActive } or null. Only called for OAuth.
 */
export async function evaluateSignIn(
  provider: string,
  user: GateUser,
  findUserByEmail: FindUserByEmail,
): Promise<boolean> {
  if (provider === "credentials") {
    return true;
  }

  // OAuth path
  if (!user.email) return false; // fail-safe: no email, cannot key the lookup

  const email = user.email.toLowerCase();
  const row = await findUserByEmail(email);

  if (row === null) return true; // new user — let the adapter create the row
  return row.isActive;           // existing user — honour soft-deactivation
}
