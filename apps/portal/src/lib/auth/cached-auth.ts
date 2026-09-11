import { cache } from "react";
import { auth } from "@/auth";

/**
 * Memoized variant of auth() for Server Component render trees.
 *
 * Use cachedAuth() in layouts and pages that read the session. Within a
 * single RSC render pass, cachedAuth() processes the JWT and runs the
 * jwt callback only once, even if multiple layouts and pages call it.
 *
 * Empirical basis: next-auth v5 beta.31 (initAuth in node_modules/next-auth/lib/index.js)
 * does NOT wrap its getSession() in React cache(). GET /home with the member
 * layout + home page each calling auth() fired the Tier-A DB SELECT twice
 * (5ms apart). This wrapper eliminates that duplication. See the flag-caching
 * Phase 3 empirical check result in docs/work-log/2026-07-01-flag-caching.md.
 *
 * DO NOT use cachedAuth() in:
 *   - Server actions — each action is a separate invocation; cache() is a
 *     no-op and using cachedAuth() is misleading. Call auth() directly.
 *   - Route handlers — same; each handler invocation is its own context.
 *   - NextAuth callbacks (authorize, jwt, signIn) — these run inside NextAuth's
 *     own machinery, not an RSC tree. The direct auth export is correct there.
 *   - signIn / signOut call sites — these trigger NextAuth flows that must
 *     not share a memoized session read.
 */
export const cachedAuth = cache(auth);
