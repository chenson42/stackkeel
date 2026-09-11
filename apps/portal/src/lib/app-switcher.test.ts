import { describe, expect, it } from "vitest";
import { getAppSwitcherTiles } from "./app-switcher";

describe("getAppSwitcherTiles (Portal)", () => {
  it("returns only the current-app tile when the session holds no sibling roles", () => {
    const tiles = getAppSwitcherTiles(["member"]);
    expect(tiles).toEqual([{ id: "portal", href: "/home", current: true }]);
  });

  it("adds the admin tile when the session holds an admin-app role", () => {
    const tiles = getAppSwitcherTiles(["member", "admin"]);
    expect(tiles).toHaveLength(2);
    expect(tiles.find((t) => t.id === "admin")).toMatchObject({ current: false });
  });

  it("pins fail-closed behavior: an unrecognized/orphaned role name contributes zero extra tiles", () => {
    const withGarbage = getAppSwitcherTiles(["member", "totally-not-a-real-role"]);
    const withoutGarbage = getAppSwitcherTiles(["member"]);
    expect(withGarbage).toEqual(withoutGarbage);
  });

  it("handles an undefined roles array (no crash, current-app tile only)", () => {
    const tiles = getAppSwitcherTiles(undefined);
    expect(tiles).toEqual([{ id: "portal", href: "/home", current: true }]);
  });
});
