/**
 * Unit tests for the google-native Credentials provider authorize logic.
 *
 * All external dependencies (Google token verifier, DB, rate limiter) are
 * injected via the deps object so no live Google token or database is needed.
 *
 * Strategy: build a minimal "happy-path" deps object and override individual
 * deps per test case.
 */

import { describe, it, expect, vi, type Mock } from "vitest";
import { googleNativeAuthorize } from "./google-native-authorize";
import type { GoogleNativeAuthorizeDeps, GoogleTokenPayload } from "./google-native-authorize";
import type { InviteRecord } from "./google-native-authorize";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_PAYLOAD: GoogleTokenPayload = {
  sub: "google-sub-12345",
  email: "alice@example.com",
  email_verified: true,
  name: "Alice",
  picture: "https://example.com/alice.jpg",
};

const EXISTING_USER = {
  id: "db-uuid-alice",
  email: "alice@example.com",
  name: "Alice",
  image: "https://example.com/alice.jpg",
};

const NEW_USER = {
  id: "db-uuid-new",
  email: "newbie@example.com",
  name: "Newbie",
  image: null,
};

const VALID_INVITE: InviteRecord = {
  id: "invite-123",
  email: "newbie@example.com",
};

// ---------------------------------------------------------------------------
// Happy-path deps builder
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<GoogleNativeAuthorizeDeps> = {}): GoogleNativeAuthorizeDeps {
  return {
    verifyIdToken: vi.fn().mockResolvedValue(VALID_PAYLOAD),
    checkRate: vi.fn().mockResolvedValue(true),
    findActiveUser: vi.fn().mockResolvedValue({ isActive: true }),
    findInvite: undefined,
    findExistingUser: vi.fn().mockResolvedValue(EXISTING_USER),
    createUser: vi.fn().mockResolvedValue(NEW_USER),
    ensureDefaultRole: vi.fn().mockResolvedValue(undefined),
    bindInvite: undefined,
    clearInviteCookie: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("googleNativeAuthorize", () => {
  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  it("returns null for a missing idToken", async () => {
    const deps = makeDeps();
    const result = await googleNativeAuthorize(undefined, deps);
    expect(result).toBeNull();
    expect(deps.verifyIdToken).not.toHaveBeenCalled();
  });

  it("returns null for an empty string idToken", async () => {
    const deps = makeDeps();
    expect(await googleNativeAuthorize("", deps)).toBeNull();
    expect(await googleNativeAuthorize("   ", deps)).toBeNull();
    expect(deps.verifyIdToken).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  it("returns null when the rate limit is hit", async () => {
    const deps = makeDeps({ checkRate: vi.fn().mockResolvedValue(false) });
    const result = await googleNativeAuthorize("valid-token", deps);
    expect(result).toBeNull();
    expect(deps.verifyIdToken).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Token verification
  // -------------------------------------------------------------------------

  it("returns null when verifyIdToken throws (bad signature / wrong aud / expired)", async () => {
    const deps = makeDeps({
      verifyIdToken: vi.fn().mockRejectedValue(new Error("Token has expired")),
    });
    const result = await googleNativeAuthorize("bad-token", deps);
    expect(result).toBeNull();
  });

  it("returns null when payload has no sub", async () => {
    const deps = makeDeps({
      verifyIdToken: vi.fn().mockResolvedValue({ ...VALID_PAYLOAD, sub: "" }),
    });
    const result = await googleNativeAuthorize("token", deps);
    expect(result).toBeNull();
  });

  it("returns null when payload has no email", async () => {
    const deps = makeDeps({
      verifyIdToken: vi.fn().mockResolvedValue({ ...VALID_PAYLOAD, email: "" }),
    });
    const result = await googleNativeAuthorize("token", deps);
    expect(result).toBeNull();
  });

  it("returns null when email_verified is false", async () => {
    const deps = makeDeps({
      verifyIdToken: vi.fn().mockResolvedValue({
        ...VALID_PAYLOAD,
        email_verified: false,
      }),
    });
    const result = await googleNativeAuthorize("token", deps);
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Sign-in gate (isSignInAllowed)
  // -------------------------------------------------------------------------

  it("returns null when isSignInAllowed blocks (no account, no invite)", async () => {
    const deps = makeDeps({
      findActiveUser: vi.fn().mockResolvedValue(null), // no existing account
      findInvite: undefined, // no invite
    });
    const result = await googleNativeAuthorize("token", deps);
    expect(result).toBeNull();
  });

  it("returns null when the existing user is deactivated", async () => {
    const deps = makeDeps({
      findActiveUser: vi.fn().mockResolvedValue({ isActive: false }),
    });
    const result = await googleNativeAuthorize("token", deps);
    expect(result).toBeNull();
  });

  it("returns null when isSignInAllowed blocks due to isSignInAllowed returning false with no invite dep", async () => {
    // Stranger with no account and no findInvite dep provided
    const deps = makeDeps({
      findActiveUser: vi.fn().mockResolvedValue(null),
      findInvite: undefined,
    });
    const result = await googleNativeAuthorize("token", deps);
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Existing user
  // -------------------------------------------------------------------------

  it("returns the existing DB user when the email is already registered", async () => {
    const deps = makeDeps({
      findActiveUser: vi.fn().mockResolvedValue({ isActive: true }),
      findExistingUser: vi.fn().mockResolvedValue(EXISTING_USER),
    });
    const result = await googleNativeAuthorize("valid-token", deps);
    expect(result).toEqual({
      id: EXISTING_USER.id,
      email: EXISTING_USER.email,
      name: EXISTING_USER.name,
      image: EXISTING_USER.image,
    });
    // Confirm we never attempted to create a user.
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it("normalises the email to lowercase before the user lookup", async () => {
    const mixedCasePayload: GoogleTokenPayload = {
      ...VALID_PAYLOAD,
      email: "Alice@Example.COM",
    };
    const deps = makeDeps({
      verifyIdToken: vi.fn().mockResolvedValue(mixedCasePayload),
      findExistingUser: vi.fn().mockResolvedValue(EXISTING_USER),
    });
    const result = await googleNativeAuthorize("valid-token", deps);
    expect(result).not.toBeNull();
    // findExistingUser was called with the lowercase form.
    expect((deps.findExistingUser as Mock)).toHaveBeenCalledWith("alice@example.com");
  });

  // -------------------------------------------------------------------------
  // New user — invite path
  // -------------------------------------------------------------------------

  it("creates a new user and binds the invite when none exists but invite is valid", async () => {
    const invitePayload: GoogleTokenPayload = {
      sub: "google-sub-new",
      email: "newbie@example.com",
      email_verified: true,
      name: "Newbie",
      picture: null,
    };
    const bindInvite = vi.fn().mockResolvedValue(undefined);
    const clearCookie = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      verifyIdToken: vi.fn().mockResolvedValue(invitePayload),
      findActiveUser: vi.fn().mockResolvedValue(null), // no existing account
      findInvite: vi.fn().mockResolvedValue(VALID_INVITE),
      findExistingUser: vi.fn().mockResolvedValue(null), // no DB row yet
      createUser: vi.fn().mockResolvedValue(NEW_USER),
      ensureDefaultRole: vi.fn().mockResolvedValue(undefined),
      bindInvite,
      clearInviteCookie: clearCookie,
    });

    const result = await googleNativeAuthorize("valid-token", deps);

    expect(result).toEqual({
      id: NEW_USER.id,
      email: NEW_USER.email,
      name: NEW_USER.name,
      image: NEW_USER.image,
    });
    expect(deps.createUser).toHaveBeenCalledWith({
      email: "newbie@example.com",
      name: "Newbie",
      image: null,
    });
    expect(deps.ensureDefaultRole).toHaveBeenCalledWith(NEW_USER.id, "newbie@example.com");
    expect(bindInvite).toHaveBeenCalledWith(NEW_USER.id, "newbie@example.com", VALID_INVITE);
    expect(clearCookie).toHaveBeenCalled();
  });

  it("returns null when createUser fails (returns null)", async () => {
    const invitePayload: GoogleTokenPayload = {
      ...VALID_PAYLOAD,
      email: "newbie@example.com",
    };
    const deps = makeDeps({
      verifyIdToken: vi.fn().mockResolvedValue(invitePayload),
      findActiveUser: vi.fn().mockResolvedValue(null),
      findInvite: vi.fn().mockResolvedValue(VALID_INVITE),
      findExistingUser: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue(null), // DB failure
    });

    const result = await googleNativeAuthorize("valid-token", deps);
    expect(result).toBeNull();
  });

  it("skips invite bind when findInvite is provided but returns null (no matching invite)", async () => {
    const invitePayload: GoogleTokenPayload = {
      ...VALID_PAYLOAD,
      email: "newbie@example.com",
    };
    const bindInvite = vi.fn();
    const deps = makeDeps({
      verifyIdToken: vi.fn().mockResolvedValue(invitePayload),
      findActiveUser: vi.fn().mockResolvedValue(null),
      findInvite: vi.fn().mockResolvedValue(null), // no invite found
      findExistingUser: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue(NEW_USER),
      bindInvite,
      clearInviteCookie: vi.fn(),
    });

    // isSignInAllowed will block because there is no existing user AND no
    // valid invite — so the result is null even before createUser is reached.
    const result = await googleNativeAuthorize("valid-token", deps);
    expect(result).toBeNull();
    expect(bindInvite).not.toHaveBeenCalled();
  });
});
