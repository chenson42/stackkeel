import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

/**
 * Project our custom JWT claims onto `session.user`. Shared by every app's
 * edge-safe config (via createAuthConfig) so the edge route gate sees the
 * same projection as the node-side session callback.
 *
 * Conservative defaults: a missing twoFactorRequired reads as true and a
 * missing twoFactorVerified as false — an incomplete token can only ever
 * over-gate, never under-gate.
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
  session.user.mustChangePassword = token.mustChangePassword ?? false;
  session.user.hasTotp = token.hasTotp ?? false;
  return session;
}
