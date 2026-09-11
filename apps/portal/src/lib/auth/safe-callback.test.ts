import { describe, it, expect } from "vitest";
import { sanitizeCallbackUrl } from "./safe-callback";

describe("sanitizeCallbackUrl", () => {
  it("passes through a valid relative path", () => {
    expect(sanitizeCallbackUrl("/foo")).toBe("/foo");
  });

  it("passes through a nested valid relative path", () => {
    expect(sanitizeCallbackUrl("/admin/users")).toBe("/admin/users");
  });

  it("rejects a protocol-relative URL (//evil.com) and returns /home", () => {
    expect(sanitizeCallbackUrl("//evil.com")).toBe("/home");
  });

  it("rejects an absolute http URL and returns /home", () => {
    expect(sanitizeCallbackUrl("https://evil.com/steal")).toBe("/home");
  });

  it("rejects a non-slash-prefixed string and returns /home", () => {
    expect(sanitizeCallbackUrl("evil.com/steal")).toBe("/home");
  });

  it("returns /home for null", () => {
    expect(sanitizeCallbackUrl(null)).toBe("/home");
  });

  it("returns /home for undefined", () => {
    expect(sanitizeCallbackUrl(undefined)).toBe("/home");
  });

  it("returns /home for an empty string", () => {
    expect(sanitizeCallbackUrl("")).toBe("/home");
  });
});
