// /launch is the single post-auth landing target with no happy-path UI of
// its own: OAuth callbacks, deep links, and the signin page all send users
// here, and this pure function decides where they actually go. Kept as its
// own module (not inlined in page.tsx) so it's unit-testable — the routing
// matrix is exactly the shared portal resolver's, with /home as the default
// destination when no explicit callbackUrl survived sanitization.
import { resolvePortalPostSignInDestination } from "@repo/auth/post-signin";

export const PORTAL_HOME = "/home";

export function resolveLaunchDestination(
  user: {
    twoFactorRequired: boolean;
    twoFactorVerified: boolean;
    hasTotp: boolean;
    mustChangePassword: boolean;
  } | null | undefined,
  callbackUrl?: string | null,
): string {
  return resolvePortalPostSignInDestination(user, callbackUrl || PORTAL_HOME);
}
