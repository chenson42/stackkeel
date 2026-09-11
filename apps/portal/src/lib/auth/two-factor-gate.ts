/**
 * Single source of truth for "does this session still need TOTP
 * verification before it may reach a 2FA-gated route" — for Portal's own
 * call sites.
 *
 * `needsTwoFactorVerification` and `resolvePostSignInDestination` are now
 * re-exported from `@repo/auth` (packages/auth/src/post-signin.ts), where
 * they were promoted verbatim during
 * apps/portal/docs/work-log/2026-09-04-shared-login-component.md's
 * Increment A (logic unchanged — confirmed by direct read-then-copy, not
 * reimplementation). This file stays as the re-export point so Portal's
 * existing call sites (`src/proxy.ts`,
 * `src/app/(admin)/admin/layout.tsx`, `src/app/(auth)/signin/actions.ts`)
 * don't need to change their import paths — only `@repo/auth`'s copy is
 * now the actual implementation.
 *
 * The kit portal has NO path-scoped 2FA carve-outs: a user whose account
 * requires a second factor verifies before reaching ANY signed-in route.
 *
 *  - `src/proxy.ts` — Edge Middleware; catches a fresh top-level navigation
 *    to `/admin/*`.
 *  - `src/app/(admin)/admin/layout.tsx` — RSC-layer defense-in-depth for the
 *    whole `/admin` subtree.
 *  - `src/app/(auth)/signin/actions.ts` — the credentials sign-in server
 *    action; a second, independent enforcement point for the case where a
 *    Server-Action-driven redirect to a caller-supplied `callbackUrl` does
 *    not trigger a fresh Middleware invocation. See
 *    `docs/work-log/2026-09-03-2fa-gate-bypass.md` for the full root-cause
 *    analysis of why relying on Middleware/layout alone was insufficient.
 *
 * Before adding a fourth call site, prefer extending this file (or
 * importing directly from `@repo/auth`) over re-implementing the condition
 * inline.
 */
// Imported from the narrow `@repo/auth/post-signin` subpath, not the bare
// `@repo/auth` barrel — see safe-callback.ts's own comment for why: the
// barrel's index.ts re-exports factory.ts, which imports next-auth, and
// pulling that into a file this pure/edge-safe breaks Vitest's module
// resolution for a real, pre-existing Node-ESM extensionless-import quirk
// in next-auth's own lib/env.js, unrelated to this logic.
import {
  needsTwoFactorVerification as sharedNeedsTwoFactorVerification,
  resolvePortalPostSignInDestination,
} from "@repo/auth/post-signin";

export const needsTwoFactorVerification = sharedNeedsTwoFactorVerification;

/**
 * Decide where a just-authenticated user should land: the caller-supplied
 * `callbackUrl`, or `/totp` (carrying the original `callbackUrl` forward as
 * `/totp`'s own query param) if the destination is 2FA-gated and the
 * session still requires TOTP verification. See `@repo/auth`'s
 * `resolvePortalPostSignInDestination` for the full implementation and its
 * own docstring.
 */
export const resolvePostSignInDestination = resolvePortalPostSignInDestination;
