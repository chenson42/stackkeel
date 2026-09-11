// src/lib/auth/local-login.ts
//
// Fail-open helpers for auth-critical feature flags. See DECISION-026.
//
// DESIGN CONSTRAINT: these helpers are called from Node-runtime-only paths
// (authorize() and jwt() in src/auth.ts). They must NOT be imported from
// proxy.ts, which runs on the Edge runtime.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { featureFlags } from "@/lib/db/schema";
import { isFlagEnabled } from "@/lib/flags";

const LOCAL_LOGIN_FLAG = "auth.local_login";
const REQUIRE_2FA_FLAG = "auth.require_2fa";

/**
 * Fail-open helper for the auth-critical `auth.local_login` flag.
 *
 * Standard isFlagEnabled() returns false on a missing row — the WRONG default
 * for a flag that gates the credentials endpoint itself. A missing row (not
 * yet seeded) must be treated as "enabled" so new forks don't get locked out.
 * See DECISION-026.
 *
 * Four outcomes:
 *   row missing  → true  (flag not yet seeded; treat as enabled; fail-open)
 *   row.enabled  → true  (admin left credentials on)
 *   row.enabled  → false (admin explicitly disabled credentials)
 *   DB error     → true  (never lock out credentials sign-in during a DB blip)
 */
export async function isLocalLoginEnabled(): Promise<boolean> {
  try {
    const row = await db.query.featureFlags.findFirst({
      where: eq(featureFlags.key, LOCAL_LOGIN_FLAG),
    });
    // undefined → flag not yet seeded → fail-open (true)
    // null is not expected from Drizzle findFirst, but guard it anyway
    return row == null ? true : row.enabled;
  } catch {
    // DB unreachable → fail-open: never lock everyone out of credentials sign-in
    return true;
  }
}

/**
 * Compute the effective twoFactorRequired value for a jwt() callback.
 *
 * When rawRequired is false, short-circuits — no flag read needed.
 * When rawRequired is true, reads the `auth.require_2fa` org-level master
 * switch:
 *   flag ON  → true  (user must complete TOTP challenge on admin routes)
 *   flag OFF → false (master switch disables enforcement org-wide)
 *   DB error → rawRequired (fall back to raw column — pre-feature behavior)
 *
 * This is NOT fail-open: missing flag → false → no enforcement. That is the
 * safe default for a flag whose job is to _add_ gating, not to gate sign-in.
 */
export async function computeEffectiveTwoFactor(
  rawRequired: boolean,
): Promise<boolean> {
  if (!rawRequired) return false;
  try {
    return await isFlagEnabled(REQUIRE_2FA_FLAG);
  } catch {
    // DB blip: reproduce pre-feature behavior (raw column value)
    return rawRequired;
  }
}
