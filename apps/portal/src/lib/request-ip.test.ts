/**
 * Unit tests for getRequestIp() — three-tier IP-extraction precedence.
 *
 * DECISION-017 precedence:
 *   1. cf-connecting-ip — unconditionally trusted; highest priority.
 *   2. x-forwarded-for (first value) — only when TRUST_PROXY_HEADERS=true.
 *   3. x-real-ip — Vercel's edge-set fallback.
 *
 * No mocking needed: getRequestIp() is a pure function that reads from a
 * Headers object. Tests use the standard web Headers API.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getRequestIp } from "./request-ip";

describe("getRequestIp — cf-connecting-ip (tier 1, unconditional)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns cf-connecting-ip when present, ignoring TRUST_PROXY_HEADERS", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    const hdrs = new Headers({ "cf-connecting-ip": "203.0.113.1" });
    expect(getRequestIp(hdrs)).toBe("203.0.113.1");
  });

  it("trims whitespace from cf-connecting-ip", () => {
    const hdrs = new Headers({ "cf-connecting-ip": "  203.0.113.1  " });
    expect(getRequestIp(hdrs)).toBe("203.0.113.1");
  });

  it("prefers cf-connecting-ip over x-forwarded-for even with TRUST_PROXY_HEADERS=true", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const hdrs = new Headers({
      "cf-connecting-ip": "203.0.113.1",
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      "x-real-ip": "9.9.9.9",
    });
    expect(getRequestIp(hdrs)).toBe("203.0.113.1");
  });

  it("prefers cf-connecting-ip over x-real-ip", () => {
    const hdrs = new Headers({
      "cf-connecting-ip": "203.0.113.1",
      "x-real-ip": "9.9.9.9",
    });
    expect(getRequestIp(hdrs)).toBe("203.0.113.1");
  });
});

describe("getRequestIp — x-forwarded-for (tier 2, TRUST_PROXY_HEADERS=true only)", () => {
  beforeEach(() => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the first value of x-forwarded-for when TRUST_PROXY_HEADERS=true", () => {
    const hdrs = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getRequestIp(hdrs)).toBe("1.2.3.4");
  });

  it("returns the only value when x-forwarded-for has a single entry", () => {
    const hdrs = new Headers({ "x-forwarded-for": "1.2.3.4" });
    expect(getRequestIp(hdrs)).toBe("1.2.3.4");
  });

  it("trims whitespace from x-forwarded-for first value", () => {
    const hdrs = new Headers({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" });
    expect(getRequestIp(hdrs)).toBe("1.2.3.4");
  });
});

describe("getRequestIp — x-forwarded-for ignored when TRUST_PROXY_HEADERS=false", () => {
  beforeEach(() => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores x-forwarded-for when TRUST_PROXY_HEADERS=false — regression for IP-spoofing bypass", () => {
    const hdrs = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getRequestIp(hdrs)).toBeNull();
  });

  it("falls through to x-real-ip when x-forwarded-for is present but TRUST_PROXY_HEADERS=false", () => {
    const hdrs = new Headers({
      "x-forwarded-for": "spoofed.attacker.ip",
      "x-real-ip": "9.10.11.12",
    });
    expect(getRequestIp(hdrs)).toBe("9.10.11.12");
  });
});

describe("getRequestIp — x-real-ip (tier 3, Vercel edge fallback)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns x-real-ip when cf-connecting-ip is absent and TRUST_PROXY_HEADERS=false", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    const hdrs = new Headers({ "x-real-ip": "9.10.11.12" });
    expect(getRequestIp(hdrs)).toBe("9.10.11.12");
  });

  it("trims whitespace from x-real-ip", () => {
    const hdrs = new Headers({ "x-real-ip": "  9.10.11.12  " });
    expect(getRequestIp(hdrs)).toBe("9.10.11.12");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent and TRUST_PROXY_HEADERS=true", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const hdrs = new Headers({ "x-real-ip": "9.10.11.12" });
    expect(getRequestIp(hdrs)).toBe("9.10.11.12");
  });
});

describe("getRequestIp — null when no applicable header present", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when no IP headers are present (local dev)", () => {
    const hdrs = new Headers();
    expect(getRequestIp(hdrs)).toBeNull();
  });

  it("returns null when only irrelevant headers are present", () => {
    const hdrs = new Headers({ "content-type": "application/json" });
    expect(getRequestIp(hdrs)).toBeNull();
  });

  it("returns null when TRUST_PROXY_HEADERS=false and no x-real-ip or cf-connecting-ip", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    const hdrs = new Headers({ "x-forwarded-for": "1.2.3.4" }); // XFF ignored
    expect(getRequestIp(hdrs)).toBeNull();
  });
});
