// apps/portal/src/lib/auth/second-factor-policy.ts (NEW)
//
// The "does this user owe a second factor at sign-in" predicate for the
// ATOMIC 2FA model (flag ATOMIC_TOTP_FLAG below) —
// apps/portal/docs/work-log/2026-09-08-2fa-atomic-convergence.md Phase 3
// §§ 1-2, implementing Chris's 2026-09-08 ruling (root docs/decisions.md
// DECISION-020/021).
//
// Composes @repo/auth's existing computeSharedJwtClaims (Node-side, one
// query round trip) with @repo/permissions' pure hasFeature, reusing
// Portal's own already-4x-used FEATURES.ADMIN_DASHBOARD predicate
// ((account)/layout.tsx:37, (member)/home/page.tsx:43, global-nav.tsx:46,
// nav-groups.tsx:91) — this file does NOT invent a new definition of
// "admin-ish." Chris's ruling is explicit that the set must be DERIVED from
// the FEATURES/role catalog, never hand-typed — a hand-typed security
// denylist wrong in both directions is one of the two root causes behind
// this repo's entire verification-contracts system (root CLAUDE.md §
// Evidence Classes).
//
// DELIBERATELY does not read users.twoFactorRequired (Phase 2 § 6's
// landmine — that column defaults `true` for every row, including a
// never-enrolled ordinary volunteer). owesSecondFactor is built from
// `isAdminIsh || claims.hasTotp` only. Folding the column in here would
// force mandatory TOTP setup on every never-enrolled ordinary volunteer —
// the exact inverse of Chris's ruling row 4. That column and its
// admin-toggle UI (two-factor-card.tsx) keep driving the LEGACY path's
// computeEffectiveTwoFactor() unchanged (local-login.ts) — untouched by
// this file, disposition stated explicitly per Phase 3 § 1.
// Imported from the narrow "@repo/auth/jwt" subpath (added this increment —
// packages/auth/package.json's "exports" map), NOT the bare "@repo/auth"
// barrel. Same reason two-factor-gate.ts's own header documents for
// "@repo/auth/post-signin": the barrel's index.ts also re-exports
// factory.ts, whose real `import NextAuth from "next-auth"` runs
// next-auth's env-detection code as a side effect at module load — a
// side effect Vitest's node test environment cannot resolve
// (`Cannot find module '.../next-auth/lib/env.js' -> next/server`).
// jwt.ts itself has no next-auth dependency at all (drizzle-orm, @repo/db,
// @repo/permissions only), so it can have its own subpath the same way
// two-factor.ts/lockout.ts/safe-callback.ts/post-signin.ts/audit.ts
// already do. Found during this increment's own test run — not a
// hypothetical: apps/portal/src/auth.ts (the production file) imports
// computeSharedJwtClaims from the bare barrel today, which is fine there
// (Next.js/Node runtime, not Vitest) but breaks the moment this file tried
// to do the same and get unit-tested.
import { computeSharedJwtClaims } from "@repo/auth/jwt";
import type { Db, IdentitySchema } from "@repo/db";
import { hasFeature, FEATURES } from "@/lib/permissions";

const FEATURE_KEYS = Object.values(FEATURES) as string[];

/**
 * Row-scoped app='portal' feature flag gating the atomic-authorize() path
 * in src/auth.ts. Exported here (not local-login.ts) so both src/auth.ts
 * and the sign-in page (src/app/(auth)/signin/page.tsx, ux-developer's
 * client half) read the identical key — never hand-typed twice.
 * Defaults OFF: isFlagEnabledFor (@repo/db) returns false for a row that
 * doesn't exist yet, so an unseeded environment gets today's legacy
 * behavior, not a surprise cutover. scripts/seed.ts seeds it explicitly
 * anyway (enabled: false) per that script's own "row must exist before any
 * later increment reads it" discipline.
 */
export const ATOMIC_TOTP_FLAG = "auth.atomic_totp";

export interface SecondFactorPolicy {
  /** Does authorize() require a code (of either kind) before issuing a session? */
  owesSecondFactor: boolean;
  /** Is there a TOTP secret to check a submitted code against at all? */
  hasTotp: boolean;
}

/**
 * Generic over TSchema, matching computeSharedJwtClaims'/createAuth's own
 * generic shape (packages/auth/src/jwt.ts's header explains why: Portal's
 * `db` is built from its own WIDER schema module — re-exports the 11
 * shared identity tables plus Portal's ~30 domain tables — which is not
 * structurally assignable to a `Db` fixed to the identity-only default.
 * A non-generic `db: Db` parameter here would reject Portal's own `db`
 * value at every call site). This is a correction found during Phase 4's
 * entry check, not what Phase 3's own code sample showed (a plain `db: Db`
 * annotation) — see the work-log's Phase 4 § Divergence for detail.
 */
export async function computeSecondFactorPolicy<
  TSchema extends IdentitySchema = IdentitySchema,
>(db: Db<TSchema>, userId: string): Promise<SecondFactorPolicy> {
  const claims = await computeSharedJwtClaims(db, userId, {
    featureKeys: FEATURE_KEYS,
    refreshRoles: true, // runs once, at sign-in — not a per-request cost
  });
  // Defensive only: authorize()'s own isActive/password check already
  // returns null before this is reachable in practice for a row that's
  // gone or deactivated.
  if (!claims) return { owesSecondFactor: false, hasTotp: false };

  const isAdminIsh = hasFeature(claims.features, FEATURES.ADMIN_DASHBOARD);
  // THE TRAP, AVOIDED: claims.twoFactorRequired (the users.twoFactorRequired
  // column) is not read here at all — see file header.
  return {
    owesSecondFactor: isAdminIsh || claims.hasTotp,
    hasTotp: claims.hasTotp,
  };
}
