// Imported from the narrow `@repo/auth/safe-callback` subpath, not the
// bare `@repo/auth` barrel — the barrel's index.ts re-exports factory.ts,
// which imports next-auth, and pulling that into a file this pure/edge-safe
// breaks Vitest's module resolution for a real (pre-existing, unrelated to
// this logic) Node-ESM extensionless-import quirk in next-auth's own
// lib/env.js. Mirrors the existing `./two-factor` / `./lockout` subpath
// precedent in packages/auth/package.json, extended here for `safe-callback`
// and `post-signin` during this pass (2026-09-04-shared-login-component,
// Increment B).
import { sanitizeCallbackUrl as sanitizeCallbackUrlShared } from "@repo/auth/safe-callback";

/**
 * Thin, Portal-specific wrapper around @repo/auth's shared
 * `sanitizeCallbackUrl(raw, fallback)`, fixing this app's own fallback
 * (`/home`) so the ~20+ existing single-argument call sites across this app
 * don't need to change.
 *
 * See packages/auth/src/safe-callback.ts for the shared implementation
 * (backslash-variant open-redirect gap closed there) and
 * apps/portal/docs/work-log/2026-09-04-shared-login-component.md (Phase 2
 * Placement, Phase 3 Component/Page Plan, Increment B) for why this
 * consolidation happened and why each app keeps its own thin wrapper
 * instead of every call site passing a fallback explicitly.
 */
export function sanitizeCallbackUrl(raw: string | undefined | null): string {
  return sanitizeCallbackUrlShared(raw, "/home");
}
