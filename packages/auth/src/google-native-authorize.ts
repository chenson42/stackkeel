// server-only
//
// google-native-authorize — extracted, testable core of the google-native
// Credentials provider's authorize function.
//
// The actual NextAuth provider in each app's src/auth.ts calls this,
// passing
// the Google token-verification client and all database dependencies as
// injected arguments — independently unit-testable without a live Google
// token or database connection. Used by the native shell's Google Sign-In
// (the ID token comes from the platform SDK, verified locally against
// Google's JWKS, accepting either the web or the native client id as
// audience).

import { isSignInAllowed } from "./sign-in-gate";
import type { FindActiveUser, ValidInviteRow } from "./sign-in-gate";

/** Minimal invite record threaded through the optional invite path. */
export type InviteRecord = ValidInviteRow;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal payload we read from a verified Google ID token. */
export interface GoogleTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string | null;
  picture?: string | null;
}

/** What the verifier returns — mirrors google-auth-library's LoginTicket shape. */
export interface TokenVerifier {
  verify(idToken: string): Promise<GoogleTokenPayload>;
}

/** DB shape returned for an existing user lookup by email. */
export interface ExistingUserRow {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

/** Dependencies injected from src/auth.ts (all DB and cookie reads). */
export interface GoogleNativeAuthorizeDeps {
  /** Verify an ID token. Throws on invalid signature, wrong aud, expired, etc. */
  verifyIdToken: TokenVerifier["verify"];
  /** Rate-limit check — returns true if the request is allowed. */
  checkRate: () => Promise<boolean>;
  /** Check sign-in gate (active user or valid invite). */
  findActiveUser: FindActiveUser;
  /** Look up a valid invite by raw token + email (null when no invite). */
  findInvite: ((email: string) => Promise<InviteRecord | null>) | undefined;
  /** Look up an existing user row by email. */
  findExistingUser: (email: string) => Promise<ExistingUserRow | null>;
  /** Create a new user row; returns the new row. */
  createUser: (data: { email: string; name: string | null; image: string | null }) => Promise<ExistingUserRow | null>;
  /** Assign default role (idempotent). */
  ensureDefaultRole: (userId: string, email: string) => Promise<void>;
  /** Bind the invite and write audit events. */
  bindInvite: ((userId: string, email: string, invite: InviteRecord) => Promise<void>) | undefined;
  /** Clear the invite cookie after binding (best-effort). */
  clearInviteCookie: (() => Promise<void>) | undefined;
}

/**
 * Core authorize logic for the google-native Credentials provider.
 *
 * Returns the user object on success, or null on any failure.
 * Never throws — callers should catch at the boundary.
 */
export async function googleNativeAuthorize(
  idToken: string | undefined,
  deps: GoogleNativeAuthorizeDeps,
): Promise<{ id: string; email: string; name: string | null; image: string | null } | null> {
  // 1. Validate presence.
  if (!idToken || idToken.trim() === "") return null;

  // 2. Rate limit.
  const allowed = await deps.checkRate();
  if (!allowed) return null;

  // 3. Verify idToken — throws on bad signature, wrong aud, expired, etc.
  let payload: GoogleTokenPayload;
  try {
    payload = await deps.verifyIdToken(idToken);
  } catch (err) {
    console.error("[google-native] idToken verification failed:", err);
    return null;
  }

  // 4. Claim checks (belt-and-suspenders on top of the library).
  const { sub, email: rawEmail, email_verified, name, picture } = payload;
  if (!sub || !rawEmail) return null;
  if (email_verified !== true) return null;

  const email = rawEmail.toLowerCase();

  // 5. Sign-in gate — same logic as the web Google OAuth path.
  const gateAllowed = await isSignInAllowed(
    { user: { id: sub, email }, account: { provider: "google-native" } },
    deps.findActiveUser,
    deps.findInvite,
  );
  if (!gateAllowed) return null;

  // 6. Look up or create the database user.
  const existingUser = await deps.findExistingUser(email);
  if (existingUser) {
    return {
      id: existingUser.id,
      email: existingUser.email,
      name: existingUser.name,
      image: existingUser.image,
    };
  }

  // New user — invite path only (gate confirmed above).
  // audit-exempt: account creation via invite — bindInvite writes its own
  // audit events; no separate "user created" event exists for the web
  // Google OAuth path either (events.createUser is not audited).
  const newUser = await deps.createUser({
    email,
    name: name ?? null,
    image: picture ?? null,
  });
  if (!newUser) return null;

  await deps.ensureDefaultRole(newUser.id, email);

  if (deps.findInvite && deps.bindInvite) {
    const invite = await deps.findInvite(email);
    if (invite) {
      await deps.bindInvite(newUser.id, email, invite);
      if (deps.clearInviteCookie) {
        await deps.clearInviteCookie().catch(() => {
          // Best-effort — never block sign-in on cookie clear failure.
        });
      }
    }
  }

  return {
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    image: newUser.image,
  };
}
