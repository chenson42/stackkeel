import { describe, it, expect } from "vitest";
import { decideVersionGate } from "./version-gate-logic";

const base = { nativeBuild: 10, latestBuild: 12, minBuild: 8, platform: "ios" };

describe("decideVersionGate — five fail-open paths", () => {
  it("1: flag off → none, regardless of state", () => {
    expect(decideVersionGate(false, { ...base, nativeBuild: 1 })).toBe("none");
  });
  it("2: unresolved state → none", () => {
    expect(decideVersionGate(true, null)).toBe("none");
  });
  it("3: null nativeBuild → none", () => {
    expect(decideVersionGate(true, { ...base, nativeBuild: null })).toBe("none");
  });
  it("4: null latestBuild → no soft banner", () => {
    expect(decideVersionGate(true, { ...base, latestBuild: null })).toBe("none");
  });
  it("5: null minBuild → no hard block", () => {
    expect(
      decideVersionGate(true, { ...base, nativeBuild: 1, minBuild: null, latestBuild: null }),
    ).toBe("none");
  });
});

describe("decideVersionGate — real decisions", () => {
  it("hard-blocks below minBuild (and hard beats soft)", () => {
    expect(decideVersionGate(true, { ...base, nativeBuild: 7 })).toBe("hard-block");
  });
  it("soft-banners between minBuild and latestBuild", () => {
    expect(decideVersionGate(true, { ...base, nativeBuild: 10 })).toBe("soft-banner");
  });
  it("renders nothing when current", () => {
    expect(decideVersionGate(true, { ...base, nativeBuild: 12 })).toBe("none");
  });
});
