import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

/**
 * Project our custom JWT claims onto `session.user`.
 *
 * Lives in its own module — separate from `config.ts` — so it can be unit
 * tested without dragging in the NextAuth runtime. Both `authConfig.session`
 * (edge + node) call this. If the wiring ever regresses, the test file next
 * to this one catches it in milliseconds and the Playwright spec in `e2e/`
 * catches it end-to-end.
 *
 * Defaults are deliberately conservative: missing `twoFactorRequired` →
 * `true` (enforce 2FA), missing `twoFactorVerified` → `false`. An older
 * sign-in path can't accidentally bypass the 2FA gate by omitting claims.
 */
export function projectJWTOntoSession(session: Session, token: JWT): Session {
  if (!token?.sub) return session;
  session.user.id = token.sub;
  if (typeof token.email === "string") session.user.email = token.email;
  session.user.roles = token.roles ?? [];
  session.user.features = token.features ?? [];
  session.user.isActive = token.isActive ?? true;
  session.user.twoFactorRequired = token.twoFactorRequired ?? true;
  session.user.twoFactorVerified = token.twoFactorVerified ?? false;
  // Task-management persona (DECISION-030/031) — null = pending, same
  // semantics as no-userRoles-row today.
  session.user.globalRole = token.globalRole ?? null;
  session.user.canCreateProjectsOverride =
    token.canCreateProjectsOverride ?? false;
  return session;
}
