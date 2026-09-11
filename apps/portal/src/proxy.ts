import { NextResponse, type NextRequest } from "next/server";
import { edgeAuth } from "@/lib/auth/config";
import { ADMIN_ROLE, FEATURES, hasFeature } from "@/lib/permissions";
import { needsTwoFactorVerification } from "@/lib/auth/two-factor-gate";

const PUBLIC_PATHS = new Set([
  "/",
  "/signin",
  "/totp",
  "/access-pending",
  "/robots.txt",
  "/sitemap.xml",
  "/forgot-password",
  "/reset-password",
]);

// Feature-gated route families (first match wins). Every entry here has
// the SAME check in the destination page (the honest denied state) and the
// identical feature key in the tile registry's isVisible — three surfaces,
// one key, never a second permission vocabulary.
const PROTECTION_RULES: Array<{ pattern: RegExp; required: string }> = [
  // Helpdesk (module `helpdesk`): file/read own support tickets.
  { pattern: /^\/support(\/|$)/, required: "tickets.file" },
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) return NextResponse.next();
  if (pathname.startsWith("/account/verify-email/")) return NextResponse.next();
  // Universal Links / App Links verifiers (Apple CDN, Google) fetch these
  // anonymously; they must never bounce to /signin (module `mobile`).
  if (pathname.startsWith("/.well-known/")) return NextResponse.next();
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const session = await edgeAuth();
  if (!session?.user) {
    const url = new URL("/signin", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  if (session.user.isActive === false) {
    const url = new URL("/signin", req.url);
    url.searchParams.set("error", "deactivated");
    return NextResponse.redirect(url);
  }

  // Atomic-2FA mid-session role-escalation defense-in-depth (2026-09-08
  // convergence in a predecessor codebase).
  // A member signs in with no second factor owed, then is granted an
  // admin-ish role by an operator later in the SAME session. Role grants already force a claims
  // refresh via unstable_update() (jwt()'s trigger === "update" branch), so
  // session.user.features picks up FEATURES.ADMIN_DASHBOARD on the very
  // next request — but the atomic model's only 2FA checkpoint is
  // sign-in-time, and this session was already issued. Nudge (not block)
  // to /account/2fa, unconditionally (not path-scoped) — an admin-ish user
  // must be prompted wherever they go, not only inside /admin.
  //
  // Gated on session.user.atomicTotpEnabled (fixed at THIS session's mint
  // time) so merely DEPLOYING this code — before ATOMIC_TOTP_FLAG is ever
  // flipped on for anyone — does not start force-redirecting a
  // never-enrolled admin-ish user signed in entirely through the legacy
  // path, which would break the "off = today's behavior, exactly" rollback
  // contract Increment 1's flag design depends on (Phase 3 § 8).
  //
  // Both session.user.hasTotp and session.user.features are already
  // projected edge-side with no DB call (packages/auth/src/session-
  // projection.ts:17,27) — this reads JWT claims only, same invariant as
  // every other check in this file.
  if (
    session.user.atomicTotpEnabled &&
    hasFeature(session.user.features, FEATURES.ADMIN_DASHBOARD) &&
    !session.user.hasTotp &&
    pathname !== "/account/2fa"
  ) {
    const url = new URL("/account/2fa", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // Post-sign-in precedence — MUST mirror @repo/auth's
  // resolvePortalPostSignInDestination exactly (its header carries the
  // contract): mustChangePassword → not-enrolled-but-required → enrolled-
  // but-unverified. Self-exclusions prevent redirect loops on the very
  // pages each gate sends the user to.
  if (session.user.mustChangePassword && pathname !== "/change-password") {
    const url = new URL("/change-password", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  if (
    session.user.twoFactorRequired &&
    !session.user.hasTotp &&
    !pathname.startsWith("/account/2fa")
  ) {
    const url = new URL("/account/2fa/setup", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  if (needsTwoFactorVerification(session.user)) {
    const url = new URL("/totp", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (session.user.roles?.includes(ADMIN_ROLE)) return NextResponse.next();

  for (const rule of PROTECTION_RULES) {
    if (rule.pattern.test(pathname)) {
      const ok = session.user.features?.includes(rule.required);
      if (!ok) {
        const dest = new URL("/access-pending", req.url);
        dest.searchParams.set("from", pathname);
        return NextResponse.redirect(dest);
      }
      return NextResponse.next();
    }
  }

  // INTENTIONAL FALL-THROUGH — auth-only, no feature gate required.
  //
  // Paths that reach here are authenticated (session checked above) but do not
  // match any PROTECTION_RULES entry. This is the correct and deliberate
  // behavior for the /account/* subtree (/account, /account/2fa, etc.) — any
  // signed-in user may access their own account pages regardless of role.
  //
  // DO NOT add a catch-all PROTECTION_RULES entry that would accidentally
  // swallow /account/* routes. If you add a new route family that needs its own
  // access control, add an explicit rule to PROTECTION_RULES above.
  //
  // Auth-only routes (no feature gate): /home, /account, /account/2fa
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
