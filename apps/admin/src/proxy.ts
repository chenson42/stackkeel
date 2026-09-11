import { NextResponse, type NextRequest } from "next/server";
import { edgeAuth } from "@/lib/auth/config";
import { ADMIN_APP_ROLE_NAMES } from "@/lib/admin-app-roles";

// Admin's route gate (DECISION-052 Ruling 4 / Phase 3 Edge Cases:
// "apps/admin/src/proxy.ts runs on the Edge runtime and must never import
// @repo/db"). Every check below is a JWT-claim read via edgeAuth() — never a
// DB query — exactly mirroring a predecessor app's src/proxy.ts and
// apps/portal/src/proxy.ts's own edge-safe shape.
//
// Unlike Portal's proxy.ts (which scopes its role/2FA gates to specific
// subtrees via PROTECTION_RULES, since most of Portal is a non-admin member
// surface), this app has NO non-admin surface — directive: "all pages
// effectively admin-only" — so every authenticated route gets the SAME
// role-gate + TOTP-gate, unconditionally. No PROTECTION_RULES table needed.
//
// Check ordering, per Phase 3 Edge Cases (stated explicitly there so this
// doesn't drift): unauthenticated -> /signin; authenticated with zero
// admin_* role -> /access-pending (checked BEFORE TOTP, so a
// zero-role visitor never gets sent through TOTP setup for an app they
// can't use); authenticated with a role but !hasTotp -> /setup-mfa
// (mirrors a predecessor app's src/proxy.ts:93's unconditional shape).

const PUBLIC_PATHS = new Set([
  "/signin",
  "/set-password",
  "/access-pending",
  "/robots.txt",
  "/sitemap.xml",
]);

function hasAdminAppRole(roles: string[] | undefined): boolean {
  if (!Array.isArray(roles)) return false;
  return roles.some((r) => (ADMIN_APP_ROLE_NAMES as readonly string[]).includes(r));
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }
  // NextAuth's own route handlers (/api/auth/[...nextauth]) — sign-in,
  // OAuth callback, session endpoint. Never gated; NextAuth enforces its
  // own semantics here. Matches Portal's/a predecessor app's own `/api/` bypass.
  if (pathname.startsWith("/api/")) return NextResponse.next();
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const session = await edgeAuth();
  const user = session?.user;

  if (!user) {
    const url = new URL("/signin", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (user.isActive === false) {
    const url = new URL("/signin", req.url);
    url.searchParams.set("error", "deactivated");
    return NextResponse.redirect(url);
  }

  if (!hasAdminAppRole(user.roles)) {
    const dest = new URL("/access-pending", req.url);
    dest.searchParams.set("from", pathname);
    return NextResponse.redirect(dest);
  }

  if (pathname !== "/setup-mfa" && !user.hasTotp) {
    const url = new URL("/setup-mfa", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
