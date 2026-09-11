import { resolveAdminPostSignInDestination } from "@repo/auth/post-signin";
import { sanitizeCallbackUrl as sharedSanitizeCallbackUrl } from "@repo/auth/safe-callback";

/**
 * Single source of truth for "where does a just-authenticated Admin
 * user land," shared by src/proxy.ts (edge, every request) and
 * src/app/signin/actions.ts (the credentials sign-in server action).
 *
 * Why a second, independent enforcement point exists in the sign-in action
 * at all, rather than trusting `signIn(..., { redirectTo })` + Middleware to
 * catch a wrong destination on the next request: Portal's own
 * docs/work-log/2026-09-03-2fa-gate-bypass.md found that a Server-Action-
 * driven redirect (the NEXT_REDIRECT throw inside signIn()/redirect()) does
 * NOT reliably trigger a fresh Middleware invocation the way a real HTTP
 * 302 from a route handler does — so a credentials sign-in that blindly
 * redirected to the caller-supplied callbackUrl could land an unverified
 * user directly on a gated route, skipping /setup-mfa or /access-pending
 * entirely. The fix there (and here) is not "make Middleware run" — it's
 * "make the action's own destination decision already correct," so
 * Middleware not running on that particular redirect doesn't matter.
 *
 * Google OAuth does NOT need this same treatment: its final redirect comes
 * from NextAuth's own /api/auth/callback/google ROUTE HANDLER (a real HTTP
 * 302), which DOES trigger a fresh Middleware pass on the client's next
 * request — see apps/admin/src/app/signin/page.tsx's plain server-action
 * wrapper around signIn("google", { redirectTo }) for why that path is
 * safe without this helper.
 *
 * Unlike Portal's own two-factor-gate.ts (which scopes the 2FA gate to the
 * /admin/* subtree only, since most of Portal is a non-admin member
 * surface), Admin's directive is "all pages effectively
 * admin-only" — every route requires a admin_* role AND a
 * confirmed TOTP enrollment, so this function applies unconditionally, no
 * path-pattern scoping needed.
 *
 * 2026-09-04 (Increment C, 2026-09-04-shared-login-component.md): this is
 * now a thin re-export of `@repo/auth/post-signin`'s
 * `resolveAdminPostSignInDestination` — confirmed byte-identical logic by
 * direct read-then-diff against this file's own pre-existing body before
 * repointing (both take the same two-field `{hasAdminAppRole, hasTotp}`
 * shape and apply the identical precedence). Kept as a named re-export
 * (rather than deleting this file and repointing every call site directly
 * at `@repo/auth`) for the same "call-site stability" reason Portal's own
 * `two-factor-gate.ts` gives for its equivalent shim — `src/app/signin/
 * actions.ts` and `src/proxy.ts`-adjacent code can keep importing from
 * `@/lib/auth/post-signin` unchanged. Deliberately still in this app's
 * CURRENT (role + one-time-enrollment) shape, not the `twoFactorVerified`-
 * aware shape Phase 3's Increment C originally sketched — that upgrade
 * would mean converging Admin onto the separate-route TOTP model, which
 * this pass explicitly does NOT do (see this app's own work-log's
 * "Increment C — Admin" section for the reasoning: Admin's atomic
 * `authorize()` check, shipped 2026-09-04 in
 * docs/work-log/2026-09-04-totp-per-login-gap.md, is kept intact).
 */
export function resolvePostSignInDestination(
  user: { hasAdminAppRole: boolean; hasTotp: boolean } | null | undefined,
  callbackUrl: string,
): string {
  // Route remap: this app's enrollment page is /setup-mfa (the shared
  // resolver's "/account/2fa/setup" names the portal-style route set), and
  // in the atomic model a session that reached post-sign-in with an
  // enrollment IS verified — TOTP was checked inside authorize().
  const destination = resolveAdminPostSignInDestination(
    user ? { ...user, twoFactorVerified: user.hasTotp } : user,
    callbackUrl,
  );
  return destination.startsWith("/account/2fa/setup")
    ? destination.replace("/account/2fa/setup", "/setup-mfa")
    : destination;
}

/**
 * Validates that a callbackUrl is a safe same-origin relative path.
 *
 * 2026-09-04 (Increment C): delegates to `@repo/auth/safe-callback`'s
 * shared `sanitizeCallbackUrl(raw, fallback)`, which also closes the
 * backslash-variant open-redirect gap (`/\evil.example`) this app's prior
 * inline copy did not guard against (Phase 1 Gaps / Phase 2 Ruling 9 of
 * 2026-09-04-shared-login-component.md). The single-argument wrapper shape
 * is preserved so this app's existing call sites (`src/app/signin/
 * page.tsx`) don't need to change.
 */
export function sanitizeCallbackUrl(raw: string | undefined | null): string {
  return sharedSanitizeCallbackUrl(raw, "/users");
}
