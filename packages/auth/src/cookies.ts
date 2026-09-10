import type { NextAuthConfig } from "next-auth";

/**
 * Shared session-cookie identity for every app in the workspace — one code
 * path builds the cookie *name*, *domain*, and session *maxAge* knobs that
 * make cross-app SSO work: both apps mint and read the exact same cookie
 * shape instead of two configs that agree by coincidence.
 *
 * CRITICAL SAFETY PROPERTY: every function here returns plain host-only
 * behavior when its corresponding env var is unset. Deployments without
 * AUTH_COOKIE_DOMAIN get ordinary per-host cookies.
 */

// 24h — the conservative default; deployments override via
// SESSION_MAX_AGE_SECONDS.
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 86400; // 24h

/**
 * Resolves the shared session cookie's `Domain` attribute.
 *
 * `explicit`, when provided by a caller (an app's own `createAuth()` call),
 * takes precedence; otherwise falls back to the `AUTH_COOKIE_DOMAIN` env var.
 * Returns `undefined` (host-only cookie, today's behavior) whenever:
 *   - neither `explicit` nor the env var is set, OR
 *   - `NODE_ENV` is not `"production"`.
 *
 * The `NODE_ENV` gate is a hard, in-code enforcement of Phase 2 Ruling 2's
 * constraint ("never set a cookie `domain` in local dev" — a `Domain`
 * attribute on a `localhost`/`127.0.0.1` cookie breaks it outright in every
 * browser), not just a documentation convention someone could forget.
 * `next dev` sets `NODE_ENV=development`; both Vercel staging and production
 * build with `NODE_ENV=production` (Vercel has no separate staging
 * `NODE_ENV`), so `NODE_ENV=production` is the correct axis to gate on — it
 * is not a stand-in for "is this staging or prod."
 *
 * A value that survives the gate but isn't valid for the current deploy
 * (e.g. someone copy-pastes the staging domain into a local `.env`) is a
 * soft-fail: warn and ignore, never throw. Auth must never hard-fail open a
 * misconfigured env var on a shared surface like this.
 */
export function resolveCookieDomain(explicit?: string): string | undefined {
  const raw = explicit ?? process.env.AUTH_COOKIE_DOMAIN;
  if (!raw) return undefined;

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[@repo/auth] AUTH_COOKIE_DOMAIN="${raw}" is set but NODE_ENV is ` +
        `"${process.env.NODE_ENV}", not "production" — ignoring it. A cookie ` +
        "Domain attribute breaks cookies on localhost/127.0.0.1 in every " +
        "browser. This variable must only be set on a real deployed " +
        "environment (staging/production), never in local dev.",
    );
    return undefined;
  }

  return raw;
}

/**
 * Resolves the shared session `maxAge`, in seconds.
 *
 * `explicit` (an app's own override) wins if provided; otherwise reads
 * `SESSION_MAX_AGE_SECONDS`; otherwise falls back to
 * `DEFAULT_SESSION_MAX_AGE_SECONDS` (24h). An unparsable
 * env value is treated the same as unset (soft-fail to the default, no
 * throw) rather than propagating `NaN` into NextAuth's session config.
 */
export function resolveSessionMaxAge(explicit?: number): number {
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return explicit;
  }

  const raw = process.env.SESSION_MAX_AGE_SECONDS;
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }

  return DEFAULT_SESSION_MAX_AGE_SECONDS;
}

/**
 * Builds byte-identical `sessionToken` + `csrfToken` cookie definitions for
 * both the node-side (`createAuth`) and edge-safe (`createAuthConfig`)
 * paths, so both apps always mint/read the exact same cookie shape instead
 * of two configs that only agree today by coincidence.
 *
 * When `domain` is unset, the values below intentionally reproduce exactly
 * what Auth.js's own built-in defaults already compute for every real
 * deployment of these two apps (`@auth/core`'s `defaultCookies()`, gated on
 * `useSecureCookies`, which in practice is `true` in production — Vercel
 * always serves https — and `false` in local dev — always http). Verified
 * directly against `@auth/core@0.41.3`'s `lib/utils/cookie.js`. Using
 * `NODE_ENV === "production"` here rather than Auth.js's own
 * request-URL-protocol check is a deliberate, equivalent-in-practice
 * substitution — it's the same axis `resolveCookieDomain` already gates on,
 * and it lets this module build the full cookie config statically instead of
 * per-request.
 *
 * When `domain` IS set, the CSRF cookie is renamed off the `__Host-` prefix
 * onto `__Secure-`. This is not cosmetic: `__Host-` cookies are
 * browser-enforced (RFC 6265bis) to carry no `Domain` attribute at all. If a
 * `Domain` were applied to a cookie still named `__Host-authjs.csrf-token`,
 * the browser would silently drop the `Set-Cookie` header entirely —
 * breaking CSRF protection everywhere the instant `AUTH_COOKIE_DOMAIN` is
 * set. `__Secure-` requires `secure: true` + `Path=/` (both already set
 * below) but permits `Domain` — matching the session cookie's own existing
 * `__Secure-` convention.
 */
export function buildSharedCookies(opts: {
  domain?: string;
}): NonNullable<NextAuthConfig["cookies"]> {
  const isProd = process.env.NODE_ENV === "production";
  const { domain } = opts;

  // The session cookie is RENAMED when a domain is set, for the same class of
  // reason the CSRF cookie is (below) — but a subtler one, and it cost a real
  // lockout in a predecessor deployment before it was understood
  // ("redirected you too many times").
  //
  // A host-only cookie and a Domain cookie carrying the SAME NAME are two
  // DISTINCT cookies under RFC 6265. The browser stores both and sends both on
  // every request, and the server reads whichever the Cookie header lists
  // first. So when AUTH_COOKIE_DOMAIN was introduced, every browser holding a
  // pre-existing host-only `__Secure-authjs.session-token` began shadowing the
  // new domain-scoped one with a stale value that sign-in could never
  // replace — it writes the Domain cookie, while the host-only one keeps
  // winning the read. Signing in appeared to succeed and the next request
  // still looked signed-out, so the gate bounced to /login forever.
  //
  // Rotating AUTH_SECRET at the same time is what made it terminal rather than
  // merely stale: the shadowing cookie stopped decoding at all. But the
  // shadowing is the defect and would eventually strand a user on its own.
  //
  // Renaming makes the orphan inert: a browser still holding the old cookie
  // simply never sends a name this config reads. Self-healing, with no
  // dependency on anyone knowing to clear cookies — which is not a thing a
  // real user can be asked to do, and not a thing they can discover.
  //
  // COST, stated plainly: changing the name invalidates every existing session
  // once, in whichever environments have AUTH_COOKIE_DOMAIN set. Everyone signs
  // in again. That is a one-time, self-explanatory event, and strictly better
  // than an intermittent loop with no user-reachable remedy.
  const sessionTokenName = isProd
    ? domain
      ? "__Secure-authjs.session-token.shared"
      : "__Secure-authjs.session-token"
    : domain
      ? "authjs.session-token.shared"
      : "authjs.session-token";

  const csrfTokenName = domain
    ? "__Secure-authjs.csrf-token"
    : isProd
      ? "__Host-authjs.csrf-token"
      : "authjs.csrf-token";

  return {
    sessionToken: {
      name: sessionTokenName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
        ...(domain ? { domain } : {}),
      },
    },
    csrfToken: {
      name: csrfTokenName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
        ...(domain ? { domain } : {}),
      },
    },
  };
}
