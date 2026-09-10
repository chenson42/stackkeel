import { describe, it, expect, vi } from "vitest";
import { isSignInAllowed } from "./sign-in-gate";
import type { ValidInviteRow } from "./sign-in-gate";

const active = { isActive: true } as const;
const inactive = { isActive: false } as const;

const validInvite: ValidInviteRow = {
  id: "inv-1",
  email: "new@example.com",
  };

describe("isSignInAllowed", () => {
  describe("credentials", () => {
    it("allows an active user looked up by id", async () => {
      const find = vi.fn().mockResolvedValue(active);
      const ok = await isSignInAllowed(
        { user: { id: "u1", email: "a@b.com" }, account: { provider: "credentials" } },
        find,
      );
      expect(ok).toBe(true);
      expect(find).toHaveBeenCalledWith({ by: "id", value: "u1" });
    });

    it("blocks an inactive user", async () => {
      const ok = await isSignInAllowed(
        { user: { id: "u1" }, account: { provider: "credentials" } },
        async () => inactive,
      );
      expect(ok).toBe(false);
    });

    it("blocks when the row is missing (deleted mid-session)", async () => {
      const ok = await isSignInAllowed(
        { user: { id: "u1" }, account: { provider: "credentials" } },
        async () => null,
      );
      expect(ok).toBe(false);
    });

    it("blocks when user.id is absent and never queries", async () => {
      const find = vi.fn();
      const ok = await isSignInAllowed(
        { user: { id: null }, account: { provider: "credentials" } },
        find,
      );
      expect(ok).toBe(false);
      expect(find).not.toHaveBeenCalled();
    });
  });

  describe("google / oauth", () => {
    it("allows an existing active account matched by email when user.id is the provider sub", async () => {
      const find = vi.fn().mockResolvedValue(active);
      const ok = await isSignInAllowed(
        { user: { id: "117648-google-sub", email: "Casey@Example.com" }, account: { provider: "google" } },
        find,
      );
      expect(ok).toBe(true);
      // Normalised to lowercase, matched by email — NOT by the provider id.
      expect(find).toHaveBeenCalledWith({ by: "email", value: "casey@example.com" });
    });

    it("blocks an existing but deactivated account", async () => {
      const ok = await isSignInAllowed(
        { user: { id: "sub", email: "a@b.com" }, account: { provider: "google" } },
        async () => inactive,
      );
      expect(ok).toBe(false);
    });

    it("blocks a brand-new email — closed beta, no OAuth self-signup", async () => {
      const ok = await isSignInAllowed(
        { user: { id: "sub", email: "stranger@example.com" }, account: { provider: "google" } },
        async () => null,
      );
      expect(ok).toBe(false);
    });

    it("blocks when no email is present and never queries", async () => {
      const find = vi.fn();
      const ok = await isSignInAllowed(
        { user: { id: "sub", email: null }, account: { provider: "google" } },
        find,
      );
      expect(ok).toBe(false);
      expect(find).not.toHaveBeenCalled();
    });

    it("REGRESSION: never looks the OAuth profile id up against the uuid id column", async () => {
      // The original bug ran eq(users.id, <google sub>) → Postgres uuid cast
      // error → AccessDenied for every first-time Google login.
      const find = vi.fn().mockResolvedValue(active);
      await isSignInAllowed(
        { user: { id: "117648-not-a-uuid", email: "a@b.com" }, account: { provider: "google" } },
        find,
      );
      expect(find).toHaveBeenCalledWith({ by: "email", value: "a@b.com" });
      expect(find).not.toHaveBeenCalledWith(expect.objectContaining({ by: "id" }));
    });

    // ---------------------------------------------------------------------------
    // Invite-gate cases (brand-new users coming through a Google invite flow)
    // ---------------------------------------------------------------------------

    it("allows OAuth sign-in for a brand-new email when a valid invite exists", async () => {
      // No existing account (findActiveUser returns null), but invite found.
      const findActiveUser = vi.fn().mockResolvedValue(null);
      const findValidInvite = vi.fn().mockResolvedValue(validInvite);
      const ok = await isSignInAllowed(
        { user: { id: "google-sub-new", email: "new@example.com" }, account: { provider: "google" } },
        findActiveUser,
        findValidInvite,
      );
      expect(ok).toBe(true);
      expect(findActiveUser).toHaveBeenCalledWith({ by: "email", value: "new@example.com" });
      expect(findValidInvite).toHaveBeenCalledWith("new@example.com");
    });

    it("blocks OAuth sign-in for a brand-new email with no invite and no account", async () => {
      const findActiveUser = vi.fn().mockResolvedValue(null);
      const findValidInvite = vi.fn().mockResolvedValue(null);
      const ok = await isSignInAllowed(
        { user: { id: "google-sub-stranger", email: "stranger@example.com" }, account: { provider: "google" } },
        findActiveUser,
        findValidInvite,
      );
      expect(ok).toBe(false);
      expect(findValidInvite).toHaveBeenCalledWith("stranger@example.com");
    });

    it("allows OAuth sign-in for an existing active account even without an invite", async () => {
      // Existing user — invite lookup should NOT be called (short-circuit).
      const findActiveUser = vi.fn().mockResolvedValue(active);
      const findValidInvite = vi.fn();
      const ok = await isSignInAllowed(
        { user: { id: "google-sub-existing", email: "existing@example.com" }, account: { provider: "google" } },
        findActiveUser,
        findValidInvite,
      );
      expect(ok).toBe(true);
      // Short-circuit: invite lookup must NOT be called when account exists.
      expect(findValidInvite).not.toHaveBeenCalled();
    });

    it("blocks OAuth sign-in when the invite email does not match the Google email", async () => {
      // The findValidInvite function is responsible for enforcing email-binding;
      // when the DB lookup is email-keyed, a mismatch means null is returned.
      const findActiveUser = vi.fn().mockResolvedValue(null);
      // Simulate: invite exists but not for this email (DB returns null because
      // the query is keyed by the Google-verified email).
      const findValidInvite = vi.fn().mockResolvedValue(null);
      const ok = await isSignInAllowed(
        { user: { id: "google-sub-mismatch", email: "wrongemail@example.com" }, account: { provider: "google" } },
        findActiveUser,
        findValidInvite,
      );
      expect(ok).toBe(false);
    });

    it("blocks OAuth sign-in when the invite is revoked", async () => {
      // findValidInvite only returns non-revoked invites; a revoked invite
      // causes it to return null.
      const findActiveUser = vi.fn().mockResolvedValue(null);
      const findValidInvite = vi.fn().mockResolvedValue(null); // revoked → null
      const ok = await isSignInAllowed(
        { user: { id: "google-sub-revoked", email: "revoked@example.com" }, account: { provider: "google" } },
        findActiveUser,
        findValidInvite,
      );
      expect(ok).toBe(false);
    });
  });
});
