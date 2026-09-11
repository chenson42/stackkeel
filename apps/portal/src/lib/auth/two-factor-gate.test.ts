import { describe, it, expect } from "vitest";
import {
  needsTwoFactorVerification,
  resolvePostSignInDestination,
} from "./two-factor-gate";

// Regression tests for the live 2FA-gate bypass:
// docs/work-log/2026-09-03-2fa-gate-bypass.md
//
// Bug: the credentials sign-in server action
// (src/app/(auth)/signin/actions.ts) used to pass the caller-supplied
// callbackUrl straight to NextAuth's signIn({ redirectTo }), which drives
// the post-auth redirect via the Server Action's own response rather than a
// fresh top-level navigation — so src/proxy.ts's Middleware 2FA gate never
// re-ran for that specific transition. A TOTP-enrolled-but-unverified user
// signing in with callbackUrl=/admin landed directly on /admin, skipping
// /totp entirely.
//
// Fix: the action now re-checks the freshly-authenticated session via
// resolvePostSignInDestination() (the same twoFactorRequired &&
// !twoFactorVerified condition shared with proxy.ts and admin/layout.tsx)
// before honoring the caller-supplied destination.

// ---------------------------------------------------------------------------
// Faithful encoding of the OLD (pre-fix) sign-in action's redirect decision:
// it always redirected to the caller-supplied callbackUrl, full stop, with
// no 2FA check at all.
// ---------------------------------------------------------------------------
function oldResolvePostSignInDestination(callbackUrl: string): string {
  return callbackUrl;
}

const unverifiedTotpUser = { twoFactorRequired: true, twoFactorVerified: false, hasTotp: true, mustChangePassword: false };
const verifiedTotpUser = { twoFactorRequired: true, twoFactorVerified: true, hasTotp: true, mustChangePassword: false };
const noTotpUser = { twoFactorRequired: false, twoFactorVerified: false, hasTotp: true, mustChangePassword: false };

describe("needsTwoFactorVerification", () => {
  it("is true when 2FA is required and not yet verified", () => {
    expect(needsTwoFactorVerification(unverifiedTotpUser)).toBe(true);
  });

  it("is false when 2FA is required and already verified this session", () => {
    expect(needsTwoFactorVerification(verifiedTotpUser)).toBe(false);
  });

  it("is false when 2FA is not required at all", () => {
    expect(needsTwoFactorVerification(noTotpUser)).toBe(false);
  });
});

describe("resolvePostSignInDestination — 2FA-gate bypass regression", () => {
  describe("TOTP-enrolled-but-unverified user, callbackUrl pointed at a 2FA-gated route", () => {
    const callbackUrl = "/admin";

    it("OLD LOGIC — redirects straight to /admin (bug: bypasses /totp)", () => {
      // This assertion PASSES, confirming the bug: the old action handed the
      // caller-supplied callbackUrl straight through with no 2FA check,
      // landing an unverified user directly on the gated route.
      expect(oldResolvePostSignInDestination(callbackUrl)).toBe("/admin");
    });

    it("NEW LOGIC (the fix) — redirects to /totp, preserving /admin as /totp's own callbackUrl", () => {
      const destination = resolvePostSignInDestination(unverifiedTotpUser, callbackUrl);
      expect(destination).toBe("/totp?callbackUrl=%2Fadmin");
      // Sanity-check the original destination really is preserved and
      // decodes back to the intended route, matching proxy.ts's own
      // /totp?callbackUrl=... pattern.
      const parsed = new URL(destination, "http://localhost");
      expect(parsed.pathname).toBe("/totp");
      expect(parsed.searchParams.get("callbackUrl")).toBe("/admin");
    });

    it("also closes the bypass for other 2FA-gated admin subroutes (e.g. /admin/users)", () => {
      const destination = resolvePostSignInDestination(unverifiedTotpUser, "/admin/users");
      const parsed = new URL(destination, "http://localhost");
      expect(parsed.pathname).toBe("/totp");
      expect(parsed.searchParams.get("callbackUrl")).toBe("/admin/users");
    });
  });

  describe("sessions that do not need the gate", () => {
    it("verified TOTP user goes straight to the requested callbackUrl", () => {
      expect(resolvePostSignInDestination(verifiedTotpUser, "/admin")).toBe("/admin");
    });

    it("user with 2FA not required goes straight to the requested callbackUrl", () => {
      expect(resolvePostSignInDestination(noTotpUser, "/admin")).toBe("/admin");
    });

    it("gates every destination — /home included — for an unverified user (kit semantics: no path carve-outs)", () => {
      const destination = resolvePostSignInDestination(unverifiedTotpUser, "/home");
      const parsed = new URL(destination, "http://localhost");
      expect(parsed.pathname).toBe("/totp");
      expect(parsed.searchParams.get("callbackUrl")).toBe("/home");
    });
  });

  describe("defensive null/undefined session handling", () => {
    it("sends a missing session to /signin, never the callbackUrl", () => {
      expect(resolvePostSignInDestination(null, "/home")).toBe("/signin");
      expect(resolvePostSignInDestination(undefined, "/home")).toBe("/signin");
    });
  });
});
