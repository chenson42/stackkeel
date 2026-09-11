import { describe, it, expect } from "vitest";
import { resolveBackLink, type BackLinkRoute, type BackLinkFallback } from "./back-link";

/**
 * Unit tests for the pure prefix-matching helper backing `<BackLink>`
 * (2026-09-07-back-nav-and-shell-consistency, Phase 4 Increment 1). This is
 * exactly the kind of thing Phase 4's brief calls out as "a pure function
 * doing allowlist matching — it is exactly the thing that should be tested
 * directly": no DOM, no React, so plain Vitest assertions cover the whole
 * contract without @testing-library.
 *
 * Coverage maps directly onto the three things `resolveBackLink`'s own
 * header says it does: (1) reject anything that isn't a genuine path-only
 * value — the open-redirect guard — (2) prefix-match a valid path against
 * the table, and (3) fall back to a real, labelled default when either (1)
 * or (2) fails.
 */

const TABLE: readonly BackLinkRoute[] = [
  { prefix: "/participants", name: "Participants" },
  { prefix: "/classes", name: "Classes" },
  { prefix: "/dashboard", name: "Dashboard" },
];

const FALLBACK: BackLinkFallback = { href: "/participants", name: "Participants" };

describe("resolveBackLink", () => {
  describe("open-redirect guard — rejects anything that isn't a genuine path-only value", () => {
    it("falls back on an absolute URL (protocol-qualified)", () => {
      const result = resolveBackLink("https://evil.example/phish", TABLE, FALLBACK);
      expect(result).toEqual({ href: "/participants", label: "Back to Participants" });
    });

    it("falls back on a protocol-relative URL (leading //)", () => {
      const result = resolveBackLink("//evil.example/phish", TABLE, FALLBACK);
      expect(result).toEqual({ href: "/participants", label: "Back to Participants" });
    });

    it("falls back on a value with no leading slash at all", () => {
      const result = resolveBackLink("javascript:alert(1)", TABLE, FALLBACK);
      expect(result).toEqual({ href: "/participants", label: "Back to Participants" });
    });

    it("falls back on an empty string", () => {
      const result = resolveBackLink("", TABLE, FALLBACK);
      expect(result).toEqual({ href: "/participants", label: "Back to Participants" });
    });

    it("falls back on null", () => {
      const result = resolveBackLink(null, TABLE, FALLBACK);
      expect(result).toEqual({ href: "/participants", label: "Back to Participants" });
    });

    it("falls back on undefined", () => {
      const result = resolveBackLink(undefined, TABLE, FALLBACK);
      expect(result).toEqual({ href: "/participants", label: "Back to Participants" });
    });
  });

  describe("prefix match — a real allowlist, not a single .startsWith()", () => {
    it("matches an exact prefix with no trailing segment", () => {
      const result = resolveBackLink("/classes", TABLE, FALLBACK);
      expect(result).toEqual({ href: "/classes", label: "Back to Classes" });
    });

    it("matches a prefix followed by a path segment", () => {
      const result = resolveBackLink("/classes/123/roster", TABLE, FALLBACK);
      expect(result).toEqual({ href: "/classes/123/roster", label: "Back to Classes" });
    });

    it("matches a prefix followed by a query string", () => {
      const result = resolveBackLink("/dashboard?tab=recent", TABLE, FALLBACK);
      expect(result).toEqual({
        href: "/dashboard?tab=recent",
        label: "Back to Dashboard",
      });
    });

    it("does not match a prefix that is merely a substring (no separator)", () => {
      // "/classesomething" starts with "/classes" as raw text but is not the
      // same route and has no "/" or "?" boundary — must fall back, not match.
      const result = resolveBackLink("/classesomething", TABLE, FALLBACK);
      expect(result).toEqual({ href: "/participants", label: "Back to Participants" });
    });

    it("falls back when the path is off-allowlist entirely", () => {
      const result = resolveBackLink("/some-other-page", TABLE, FALLBACK);
      expect(result).toEqual({ href: "/participants", label: "Back to Participants" });
    });
  });

  describe("fallback shape", () => {
    it("always returns a real, labelled pair — never a bare 'Back'", () => {
      const result = resolveBackLink("not-a-path", TABLE, FALLBACK);
      expect(result.label.startsWith("Back to ")).toBe(true);
      expect(result.label).not.toBe("Back");
    });

    it("uses the fallback's own href/name even when the fallback prefix isn't in the table", () => {
      const fallback: BackLinkFallback = { href: "/somewhere-else", name: "Somewhere Else" };
      const result = resolveBackLink(undefined, TABLE, fallback);
      expect(result).toEqual({ href: "/somewhere-else", label: "Back to Somewhere Else" });
    });
  });
});
