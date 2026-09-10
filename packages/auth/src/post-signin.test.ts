import { describe, it, expect } from "vitest";
import {
  needsTwoFactorVerification,
  resolvePortalPostSignInDestination,
  resolveAdminPostSignInDestination,
} from "./post-signin";

describe("needsTwoFactorVerification", () => {
  it("is true only when required and not yet verified", () => {
    expect(
      needsTwoFactorVerification({ twoFactorRequired: true, twoFactorVerified: false }),
    ).toBe(true);
    expect(
      needsTwoFactorVerification({ twoFactorRequired: true, twoFactorVerified: true }),
    ).toBe(false);
    expect(
      needsTwoFactorVerification({ twoFactorRequired: false, twoFactorVerified: false }),
    ).toBe(false);
  });
});

describe("resolvePortalPostSignInDestination", () => {
  const base = {
    twoFactorRequired: true,
    twoFactorVerified: false,
    hasTotp: true,
    mustChangePassword: false,
  };

  it("sends a missing session to /signin", () => {
    expect(resolvePortalPostSignInDestination(null, "/home")).toBe("/signin");
    expect(resolvePortalPostSignInDestination(undefined, "/home")).toBe("/signin");
  });

  it("mustChangePassword wins over everything", () => {
    expect(
      resolvePortalPostSignInDestination(
        { ...base, mustChangePassword: true, hasTotp: false },
        "/home",
      ),
    ).toBe("/change-password");
  });

  it("routes a 2FA-required user without an enrollment to setup", () => {
    const dest = resolvePortalPostSignInDestination({ ...base, hasTotp: false }, "/home");
    expect(dest).toBe("/account/2fa/setup?callbackUrl=%2Fhome");
  });

  it("routes an enrolled-but-unverified user to /totp with the callback preserved", () => {
    const dest = resolvePortalPostSignInDestination(base, "/projects/42");
    expect(dest).toBe("/totp?callbackUrl=%2Fprojects%2F42");
  });

  it("passes a fully verified user through to the callback", () => {
    expect(
      resolvePortalPostSignInDestination({ ...base, twoFactorVerified: true }, "/home"),
    ).toBe("/home");
  });

  it("passes a user with 2FA not required straight through, enrolled or not", () => {
    expect(
      resolvePortalPostSignInDestination(
        { ...base, twoFactorRequired: false, hasTotp: false },
        "/home",
      ),
    ).toBe("/home");
  });
});

describe("resolveAdminPostSignInDestination", () => {
  const base = { hasAdminAppRole: true, hasTotp: true, twoFactorVerified: false };

  it("sends missing sessions and non-admins to /access-pending", () => {
    expect(resolveAdminPostSignInDestination(null, "/users")).toBe("/access-pending");
    expect(
      resolveAdminPostSignInDestination({ ...base, hasAdminAppRole: false }, "/users"),
    ).toBe("/access-pending");
  });

  it("routes an un-enrolled admin to setup", () => {
    expect(
      resolveAdminPostSignInDestination({ ...base, hasTotp: false }, "/users"),
    ).toBe("/account/2fa/setup?callbackUrl=%2Fusers");
  });

  it("ignores the per-user twoFactorRequired column — 2FA is unconditional here", () => {
    // No twoFactorRequired field exists on the input at all; an enrolled but
    // unverified admin always goes to /totp.
    expect(resolveAdminPostSignInDestination(base, "/users")).toBe(
      "/totp?callbackUrl=%2Fusers",
    );
  });

  it("passes a verified admin through", () => {
    expect(
      resolveAdminPostSignInDestination({ ...base, twoFactorVerified: true }, "/users"),
    ).toBe("/users");
  });
});
