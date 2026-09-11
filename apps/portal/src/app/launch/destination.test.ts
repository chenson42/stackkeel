import { describe, expect, it } from "vitest";
import { resolveLaunchDestination, PORTAL_HOME } from "./destination";

const cleared = {
  twoFactorRequired: false,
  twoFactorVerified: false,
  hasTotp: false,
  mustChangePassword: false,
};

describe("resolveLaunchDestination", () => {
  it("lands a fully-cleared user on /home by default", () => {
    expect(resolveLaunchDestination(cleared)).toBe(PORTAL_HOME);
  });

  it("honors an explicit callbackUrl for a cleared user", () => {
    expect(resolveLaunchDestination(cleared, "/feedback")).toBe("/feedback");
  });

  it("routes mustChangePassword ahead of everything else", () => {
    expect(
      resolveLaunchDestination({ ...cleared, mustChangePassword: true, twoFactorRequired: true }),
    ).toBe("/change-password");
  });

  it("routes a 2FA-required, un-enrolled user to setup with the callback preserved", () => {
    const d = resolveLaunchDestination({ ...cleared, twoFactorRequired: true }, "/feedback");
    const u = new URL(d, "http://x");
    expect(u.pathname).toBe("/account/2fa/setup");
    expect(u.searchParams.get("callbackUrl")).toBe("/feedback");
  });

  it("routes an enrolled-but-unverified user to /totp", () => {
    const d = resolveLaunchDestination({
      ...cleared,
      twoFactorRequired: true,
      hasTotp: true,
    });
    expect(new URL(d, "http://x").pathname).toBe("/totp");
  });

  it("sends a missing session to /signin", () => {
    expect(resolveLaunchDestination(null)).toBe("/signin");
  });
});
