import { describe, it, expect, vi } from "vitest";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

// Stub next-auth so importing authConfig from ./config does not trigger the
// NextAuth() runtime initialisation (which imports next/server and is
// incompatible with the Vitest node environment).
vi.mock("next-auth", () => ({
  default: vi.fn(() => ({ auth: vi.fn() })),
}));

import { projectJWTOntoSession } from "./session-projection";
import { authConfig } from "./config";

/**
 * Guards against a regression where the `session` callback was accidentally
 * only defined in `src/auth.ts`. That left the edge runtime (proxy.ts) with
 * no projection from JWT to session, so `session.user.roles` came back
 * undefined and every admin was bounced to /access-pending. The Playwright
 * spec at `e2e/admin-login.spec.ts` catches it end-to-end; these tests
 * catch the projection contract in milliseconds.
 */
describe("projectJWTOntoSession", () => {
  function baseSession(): Session {
    return {
      user: { name: "Test", email: "x@y.z", image: null },
      expires: new Date(Date.now() + 60_000).toISOString(),
    } as Session;
  }

  it("projects every custom JWT claim onto session.user", () => {
    const token: JWT = {
      sub: "user-123",
      email: "admin@example.com",
      roles: ["admin"],
      features: ["admin.dashboard", "admin.users"],
      isActive: true,
      twoFactorRequired: false,
      twoFactorVerified: true,
    };
    const result = projectJWTOntoSession(baseSession(), token);

    expect(result.user.id).toBe("user-123");
    expect(result.user.email).toBe("admin@example.com");
    expect(result.user.roles).toEqual(["admin"]);
    expect(result.user.features).toEqual(["admin.dashboard", "admin.users"]);
    expect(result.user.isActive).toBe(true);
    expect(result.user.twoFactorRequired).toBe(false);
    expect(result.user.twoFactorVerified).toBe(true);
  });

  it("defaults safely when claims are missing", () => {
    const result = projectJWTOntoSession(baseSession(), { sub: "user-456" });

    expect(result.user.id).toBe("user-456");
    expect(result.user.roles).toEqual([]);
    expect(result.user.features).toEqual([]);
    expect(result.user.isActive).toBe(true);
    // Missing 2FA claims default to "enforce" — a stale sign-in path can't
    // bypass the gate by omitting them.
    expect(result.user.twoFactorRequired).toBe(true);
    expect(result.user.twoFactorVerified).toBe(false);
  });

  it("leaves session untouched when the token has no sub", () => {
    const session = baseSession();
    const result = projectJWTOntoSession(session, {} as JWT);

    expect((result.user as { id?: string }).id).toBeUndefined();
    expect((result.user as { roles?: string[] }).roles).toBeUndefined();
  });
});

describe("authConfig shape", () => {
  it("includes trustHost: true so OAuth callbacks work behind non-Vercel proxies", () => {
    expect(authConfig.trustHost).toBe(true);
  });
});
