import { describe, it, expect } from "vitest";
import { resolvePortalAtomicPostSignInDestination } from "./atomic-post-signin";

// Mirrors two-factor-gate.test.ts's own shape (2026-09-08-2fa-atomic-
// convergence.md Phase 3 § 9) — the atomic path's own fc0bbb6-shaped
// regression proof: proves this resolver, not proxy.ts or a mocked
// integration, decides the destination correctly for all four of Chris's
// rows.

describe("resolvePortalAtomicPostSignInDestination — Chris's four-row table", () => {
  it("row 1 (admin-ish, enrolled): passes straight through — 2FA already cleared inside authorize()", () => {
    const dest = resolvePortalAtomicPostSignInDestination(
      { owesSecondFactor: true, hasTotp: true },
      "/admin/users",
    );
    expect(dest).toBe("/admin/users");
  });

  it("row 2 (admin-ish, NOT enrolled): nudges to /account/2fa, carrying the original callbackUrl forward", () => {
    const dest = resolvePortalAtomicPostSignInDestination(
      { owesSecondFactor: true, hasTotp: false },
      "/admin/users",
    );
    expect(dest).toBe(
      `/account/2fa?${new URLSearchParams({ callbackUrl: "/admin/users" }).toString()}`,
    );
  });

  it("row 3 (ordinary member, enrolled): passes straight through — challenged inside authorize(), not here", () => {
    const dest = resolvePortalAtomicPostSignInDestination(
      { owesSecondFactor: true, hasTotp: true },
      "/home",
    );
    expect(dest).toBe("/home");
  });

  it("row 4 (ordinary member, NOT enrolled): passes straight through — never owed a second factor", () => {
    const dest = resolvePortalAtomicPostSignInDestination(
      { owesSecondFactor: false, hasTotp: false },
      "/home",
    );
    expect(dest).toBe("/home");
  });

  it("never redirects to /totp — the atomic path has no separate-route detour", () => {
    const dest = resolvePortalAtomicPostSignInDestination(
      { owesSecondFactor: true, hasTotp: false },
      "/admin/flags",
    );
    expect(dest).not.toContain("/totp");
  });

  it("is null/undefined-safe (no session)", () => {
    expect(resolvePortalAtomicPostSignInDestination(null, "/home")).toBe("/home");
    expect(resolvePortalAtomicPostSignInDestination(undefined, "/home")).toBe(
      "/home",
    );
  });
});
