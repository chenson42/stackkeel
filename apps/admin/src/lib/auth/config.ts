import NextAuth from "next-auth";
import { createAuthConfig } from "@repo/auth";

/**
 * Edge-safe NextAuth configuration for Admin. Mirrors
 * apps/portal/src/lib/auth/config.ts's exact shape — `createAuthConfig()`
 * is the shared, edge-safe base (session/authorized/session-projection
 * callbacks only, no adapter, no providers with node-only deps).
 *
 * Critical: this module is imported by src/proxy.ts, which must stay
 * import-safe for the Edge runtime (DECISION-052 Ruling 4 / Phase 3 Edge
 * Cases: "apps/admin/src/proxy.ts... must never import @repo/db"). It MUST
 * NOT import anything node-only (bcryptjs, the DrizzleAdapter, the Neon
 * client, etc.) — createAuthConfig() itself is edge-safe by construction.
 *
 * This app is standalone (not part of the shared SSO cookie domain yet —
 * umbrella Ruling 1/5), so no cookieDomain/sessionMaxAge overrides are
 * passed; createAuthConfig() falls back to its own defaults exactly as
 * Portal's edge config does when AUTH_COOKIE_DOMAIN is unset.
 */
export const authConfig = createAuthConfig({ signInPage: "/signin" });

export const { auth: edgeAuth } = NextAuth(authConfig);
