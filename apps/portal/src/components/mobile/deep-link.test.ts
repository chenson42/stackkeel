import { describe, it, expect } from "vitest";
import { deepLinkToPath } from "./deep-link";

const SCHEME = "appscheme";
const ORIGIN = "https://app.example.com";

describe("deepLinkToPath", () => {
  it("maps custom-scheme links, restoring the host-as-first-segment", () => {
    expect(deepLinkToPath("appscheme://support/123", SCHEME, ORIGIN)).toBe("/support/123");
    expect(deepLinkToPath("appscheme://home", SCHEME, ORIGIN)).toBe("/home");
    expect(deepLinkToPath("appscheme://support?tab=open", SCHEME, ORIGIN)).toBe(
      "/support?tab=open",
    );
  });

  it("maps same-origin universal links to their path", () => {
    expect(deepLinkToPath(`${ORIGIN}/support/123?x=1#top`, SCHEME, ORIGIN)).toBe(
      "/support/123?x=1#top",
    );
  });

  it("rejects foreign origins, other schemes, and malformed URLs", () => {
    expect(deepLinkToPath("https://evil.example.net/support", SCHEME, ORIGIN)).toBeNull();
    expect(deepLinkToPath("otherapp://support/123", SCHEME, ORIGIN)).toBeNull();
    expect(deepLinkToPath("not a url", SCHEME, ORIGIN)).toBeNull();
    expect(deepLinkToPath(`${ORIGIN}/x`, SCHEME, null)).toBeNull();
  });
});
