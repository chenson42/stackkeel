import { describe, it, expect } from "vitest";

// Regression tests for TOTP action guard predicates.
//
// The full server action (verifyTotp) cannot run in Vitest — it imports
// next/navigation (redirect), next-auth (auth, unstable_update), and
// drizzle-orm/neon-http. The established pattern extracts guard predicates as
// pure inline functions that mirror the action logic exactly.

// ---------------------------------------------------------------------------
// H1 — sanitizeCallbackUrl — open-redirect rejection
//
// Implementation in src/app/(auth)/totp/actions.ts:
//   function sanitizeCallbackUrl(raw: string): string {
//     return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/admin";
//   }
//
// Critical invariant: any value that is NOT a plain relative path (starting
// with a single "/") must be rejected and replaced with "/admin".
// Protocol-relative URLs ("//evil.com") must also be rejected.
// ---------------------------------------------------------------------------

function sanitizeCallbackUrl(raw: string): string {
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/admin";
}

describe(
  "sanitizeCallbackUrl — H1 open-redirect rejection — regression for unvalidated callbackUrl",
  () => {
    describe("accepts valid same-origin relative paths", () => {
      it("accepts a plain root path", () => {
        expect(sanitizeCallbackUrl("/")).toBe("/");
      });

      it("accepts /admin", () => {
        expect(sanitizeCallbackUrl("/admin")).toBe("/admin");
      });

      it("accepts a nested path", () => {
        expect(sanitizeCallbackUrl("/admin/users")).toBe("/admin/users");
      });

      it("accepts a path with a query string", () => {
        expect(sanitizeCallbackUrl("/account?tab=2fa")).toBe("/account?tab=2fa");
      });
    });

    describe("rejects absolute URLs and protocol-relative URLs — regression for open-redirect via callbackUrl", () => {
      it("rejects https:// absolute URL and defaults to /admin", () => {
        // This is the primary attack vector: callbackUrl=https://evil.com
        expect(sanitizeCallbackUrl("https://evil.com")).toBe("/admin");
      });

      it("rejects http:// absolute URL", () => {
        expect(sanitizeCallbackUrl("http://evil.com/steal")).toBe("/admin");
      });

      it("rejects protocol-relative URL starting with //", () => {
        // Protocol-relative URLs are interpreted by the browser as absolute.
        // //evil.com is equivalent to https://evil.com on an https: page.
        expect(sanitizeCallbackUrl("//evil.com")).toBe("/admin");
      });

      it("rejects protocol-relative URL with a path", () => {
        expect(sanitizeCallbackUrl("//evil.com/phish")).toBe("/admin");
      });

      it("rejects an empty string and defaults to /admin", () => {
        expect(sanitizeCallbackUrl("")).toBe("/admin");
      });

      it("rejects a bare domain (no leading slash)", () => {
        expect(sanitizeCallbackUrl("evil.com")).toBe("/admin");
      });

      it("rejects javascript: URI", () => {
        expect(sanitizeCallbackUrl("javascript:alert(1)")).toBe("/admin");
      });

      it("rejects data: URI", () => {
        expect(sanitizeCallbackUrl("data:text/html,<script>alert(1)</script>")).toBe("/admin");
      });
    });
  },
);
