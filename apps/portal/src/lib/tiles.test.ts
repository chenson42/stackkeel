import { describe, expect, it } from "vitest";
import { PORTAL_TILES, visiblePortalTiles } from "./tiles";

describe("visiblePortalTiles", () => {
  it("returns all no-feature tiles for a plain member", () => {
    const tiles = visiblePortalTiles([]);
    // Registry-derived rather than a hardcoded id list so the assertion stays
    // correct when personalization strips a tile's module.
    expect(tiles.map((t) => t.id)).toEqual(
      PORTAL_TILES.filter((t) => t.requiredFeature === null).map((t) => t.id),
    );
    expect(tiles.map((t) => t.id)).toContain("account");
  });

  it("handles undefined features (fail-closed for gated tiles, open for ungated)", () => {
    const tiles = visiblePortalTiles(undefined);
    expect(tiles.length).toBe(PORTAL_TILES.filter((t) => t.requiredFeature === null).length);
  });

  it("keeps registry order spaced by 10 and sorted", () => {
    const orders = visiblePortalTiles([]).map((t) => t.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (const o of PORTAL_TILES.map((t) => t.order)) expect(o % 10).toBe(0);
  });
});
