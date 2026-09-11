import NextAuth from "next-auth";
// Narrow subpath, NOT the "@repo/auth" barrel: the barrel re-exports
// factory.ts (real next-auth import), whose module graph Vitest's node
// resolver cannot load (next-auth's extensionless "next/server" import).
import { createAuthConfig } from "@repo/auth/config";

/**
 * Edge-safe NextAuth configuration. As of Milestone 1 of the portal
 * consolidation (Identity/Permissions Merge), the actual config shape lives
 * in @repo/auth's `createAuthConfig()` (shared with a predecessor app) — this
 * file just supplies Portal's own sign-in page and re-exports `edgeAuth` for
 * `src/proxy.ts`, unchanged from every caller's point of view.
 *
 * Critical: this module is imported by `src/proxy.ts`, which runs on the
 * Edge runtime. It MUST NOT import anything node-only (bcryptjs, the
 * DrizzleAdapter, the Neon client, etc.) — `createAuthConfig()` itself is
 * edge-safe by construction (see packages/auth/src/config.ts).
 */
export const authConfig = createAuthConfig({ signInPage: "/signin" });

export const { auth: edgeAuth } = NextAuth(authConfig);
