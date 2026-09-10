// Shared HOME for the apps' post-sign-in destination resolvers —
// deliberately NOT collapsed into one generic, config-driven function. A
// single flexible function serving different gate shapes via a config object
// is exactly the kind of cleverness that makes it easy to misconfigure one
// app's config and silently reopen a 2FA-bypass gap in another. (This
// discipline was bought with a real, shipped bypass incident in a
// predecessor codebase.)
//
// What's shared instead: explicit, separately-named exported functions
// co-located in one file so they're reviewed together and carry one shared
// contract test (./post-signin.test.ts) that can never silently drift out of
// sync with the functions it guards. DO NOT collapse these into one
// config-driven function.
//
// Each resolver must mirror its app's proxy.ts precedence EXACTLY, so the
// sign-in action can never legally disagree with what the edge gate would do
// on the very next request.

/** Pure, edge-safe building block. */
export function needsTwoFactorVerification(user: {
  twoFactorRequired: boolean;
  twoFactorVerified: boolean;
}): boolean {
  return user.twoFactorRequired && !user.twoFactorVerified;
}

/**
 * Portal — precedence: mustChangePassword → not-enrolled (when 2FA is
 * required for this user) → enrolled-but-unverified → callbackUrl.
 *
 * `user` is `null`/`undefined`-safe so callers don't need to special-case a
 * missing session.
 */
export function resolvePortalPostSignInDestination(
  user: {
    twoFactorRequired: boolean;
    twoFactorVerified: boolean;
    hasTotp: boolean;
    mustChangePassword: boolean;
  } | null | undefined,
  callbackUrl: string,
): string {
  if (!user) return "/signin";
  if (user.mustChangePassword) return "/change-password";
  if (user.twoFactorRequired && !user.hasTotp) {
    const params = new URLSearchParams({ callbackUrl });
    return `/account/2fa/setup?${params.toString()}`;
  }
  if (needsTwoFactorVerification(user)) {
    const params = new URLSearchParams({ callbackUrl });
    return `/totp?${params.toString()}`;
  }
  return callbackUrl;
}

/**
 * Admin app — every route is admin-only, so this applies unconditionally
 * (no path-pattern scoping): no admin-app role → /access-pending; no
 * confirmed TOTP enrollment → setup; enrolled-but-unverified → /totp;
 * otherwise through. The admin app never relaxes 2FA — twoFactorRequired is
 * treated as true for everyone here regardless of the per-user column.
 */
export function resolveAdminPostSignInDestination(
  user: {
    hasAdminAppRole: boolean;
    hasTotp: boolean;
    twoFactorVerified: boolean;
  } | null | undefined,
  callbackUrl: string,
): string {
  if (!user) return "/access-pending";
  if (!user.hasAdminAppRole) return "/access-pending";
  if (!user.hasTotp) {
    const params = new URLSearchParams({ callbackUrl });
    return `/account/2fa/setup?${params.toString()}`;
  }
  if (
    needsTwoFactorVerification({
      twoFactorRequired: true,
      twoFactorVerified: user.twoFactorVerified,
    })
  ) {
    const params = new URLSearchParams({ callbackUrl });
    return `/totp?${params.toString()}`;
  }
  return callbackUrl;
}
