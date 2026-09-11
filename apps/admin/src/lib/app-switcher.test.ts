import { describe, expect, it } from "vitest";
import { getAppSwitcherTiles } from "./app-switcher";

describe("getAppSwitcherTiles (Admin)", () => {
  it("shows the portal sibling for an admin (the admin role is also a portal role)", () => {
    const tiles = getAppSwitcherTiles(["admin"]);
    expect(tiles.map((t) => t.id)).toEqual(["admin", "portal"]);
    expect(tiles[0]).toMatchObject({ current: true });
    expect(tiles[1]).toMatchObject({ current: false });
  });

  it("pins fail-closed behavior for unknown role names", () => {
    expect(getAppSwitcherTiles(["admin", "garbage-role"])).toEqual(
      getAppSwitcherTiles(["admin"]),
    );
    expect(getAppSwitcherTiles(undefined)).toEqual([
      { id: "admin", href: "/users", current: true },
    ]);
  });
});
