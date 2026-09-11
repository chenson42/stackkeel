import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { buildPortalNavGroups } from "./nav-groups";

function makeSession(features: string[] = []): Session {
  return {
    user: {
      id: "u1",
      name: "Test",
      email: "t@example.com",
      roles: ["member"],
      features,
      isActive: true,
      twoFactorRequired: false,
      twoFactorVerified: true,
      mustChangePassword: false,
      hasTotp: false,
    },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session;
}

describe("buildPortalNavGroups", () => {
  it("returns the core portal nav for a plain member", () => {
    const groups = buildPortalNavGroups({ session: makeSession() });
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toEqual(["/home", "/whats-new", "/feedback"]);
  });

  it("is pure data — same session shape in, same registry out", () => {
    const a = buildPortalNavGroups({ session: makeSession(["admin.dashboard"]) });
    const b = buildPortalNavGroups({ session: makeSession(["admin.dashboard"]) });
    expect(a.flatMap((g) => g.items.map((i) => i.href))).toEqual(
      b.flatMap((g) => g.items.map((i) => i.href)),
    );
  });
});
