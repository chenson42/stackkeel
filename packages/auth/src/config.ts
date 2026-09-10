import type { NextAuthConfig } from "next-auth";
import { projectJWTOntoSession } from "./session-projection";
import { buildSharedCookies, resolveCookieDomain, resolveSessionMaxAge } from "./cookies";

/**
 * Edge-safe NextAuth configuration factory.
 *
 * Critical: this module MUST NOT import anything node-only (bcryptjs, the
 * DrizzleAdapter, the Neon client, etc.) — it is imported by every app's
 * edge route gate (src/proxy.ts). Callers that need an edge-safe gate only
 * need to decode the JWT cookie and read claims — no DB, no provider-side
 * cryptography.
 *
 * `packages/auth/src/factory.ts` extends this config with the real
 * providers + adapter for the Node-side request handlers and server
 * actions. Both share the same `AUTH_SECRET`, so a JWT signed by the full
 * config decodes cleanly here.
 *
 * `cookieDomain`/`sessionMaxAge`: optional explicit overrides, otherwise
 * resolved from `AUTH_COOKIE_DOMAIN` / `SESSION_MAX_AGE_SECONDS` via
 * `./cookies`. `session.maxAge` and `cookies` are ALWAYS set here so both
 * apps' cookie shapes are guaranteed by shared code, never true by
 * coincidence.
 */
export function createAuthConfig(opts: {
  signInPage: string;
  cookieDomain?: string;
  sessionMaxAge?: number;
}): NextAuthConfig {
  return {
    secret: process.env.AUTH_SECRET,
    // Trust the forwarded Host header so NextAuth builds OAuth callback URLs
    // using the public hostname rather than the internal one (required
    // behind any reverse proxy / hosting platform).
    trustHost: true,
    session: {
      strategy: "jwt",
      maxAge: resolveSessionMaxAge(opts.sessionMaxAge),
    },
    cookies: buildSharedCookies({ domain: resolveCookieDomain(opts.cookieDomain) }),
    providers: [],
    pages: { signIn: opts.signInPage },
    callbacks: {
      authorized({ auth }) {
        return !!auth?.user;
      },
      async session({ session, token }) {
        return projectJWTOntoSession(session, token);
      },
    },
  };
}
