/**
 * Unit tests for the in-memory rate limiter.
 *
 * Upstash path is out of scope for unit tests (requires a live Upstash
 * endpoint). Integration testing for the Upstash path should be done manually
 * or via a CI job with Upstash credentials set in env.
 *
 * Strategy: vi.useFakeTimers() advances Date.now() without real waits.
 * The in-memory implementation calls Date.now() directly on each check, so
 * fake timers control the window boundary precisely.
 *
 * The db.insert call inside checkRateLimit is mocked to a no-op so tests
 * do not require a database connection.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";

// Mock the database module before importing rate-limit so the audit write
// inside checkRateLimit does not require a live DB connection.
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        catch: vi.fn(),
      }),
    }),
  },
}));

// Mock the audit module (needed for the import chain, values are plain strings)
vi.mock("@/lib/audit", () => ({
  AUDIT_ACTIONS: {
    RATE_LIMIT_BLOCKED: "rate_limit.blocked",
  },
}));

// Mock the schema module (the export name is all we need)
vi.mock("@/lib/db/schema", () => ({
  auditEvents: {},
}));

// Import AFTER mocks are registered.
import { checkRateLimit, _inMemoryStore } from "./rate-limit";
// getRequestIp moved to @/lib/request-ip (DECISION-017). Import from there.
import { getRequestIp } from "@/lib/request-ip";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKey(suffix: string) {
  return `test:${suffix}:${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// RATE_LIMIT_DISABLED escape hatch
// ---------------------------------------------------------------------------

describe("checkRateLimit — RATE_LIMIT_DISABLED escape hatch — regression for accumulating in-memory state breaking e2e re-runs", () => {
  let insertSpy: MockInstance;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    _inMemoryStore.clear();
    // Grab the db mock's insert spy from the already-hoisted vi.mock above.
    const { db } = await import("@/lib/db");
    insertSpy = vi.spyOn(db, "insert");
    vi.stubEnv("RATE_LIMIT_DISABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    _inMemoryStore.clear();
  });

  it("returns { allowed: true } on the very first call when the escape hatch is active", async () => {
    const key = makeKey("disabled-first");

    const result = await checkRateLimit(
      key,
      { max: 5, windowSeconds: 60 },
      { userId: null, actor: "test", reason: "test" },
    );

    expect(result.allowed).toBe(true);
  });

  it("returns { allowed: true } even after exceeding max calls when the escape hatch is active", async () => {
    const key = makeKey("disabled-over-limit");
    const limit = { max: 2, windowSeconds: 60 };
    const ctx = { userId: null, actor: "test", reason: "test" };

    // Call far more than the declared limit.
    for (let i = 0; i < 20; i++) {
      const result = await checkRateLimit(key, limit, ctx);
      expect(result.allowed).toBe(true);
    }
  });

  it("writes NO audit rows when the escape hatch is active — regression for blocked-state audit noise in dev/e2e", async () => {
    const key = makeKey("disabled-no-audit");
    const limit = { max: 1, windowSeconds: 60 };
    const ctx = { userId: null, actor: "test", reason: "test" };

    insertSpy.mockClear();

    // Ten calls, all should be allowed, none should write to audit_events.
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(key, limit, ctx);
    }

    expect(insertSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getRequestIp — M3 fix: TRUST_PROXY_HEADERS controls x-forwarded-for usage
//
// Default (TRUST_PROXY_HEADERS != "true"): only x-real-ip is read.
//   - Clients cannot spoof x-real-ip on Vercel (edge sets it).
//   - Returning null when x-real-ip is absent is safe — callers key on "unknown".
//
// When TRUST_PROXY_HEADERS=true: x-forwarded-for is read first, then x-real-ip.
//   - Only enable on deployments behind a trusted, controlled proxy.
// ---------------------------------------------------------------------------

describe("getRequestIp — TRUST_PROXY_HEADERS=false (default)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Ensure TRUST_PROXY_HEADERS is not set (default false behavior)
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores x-forwarded-for when TRUST_PROXY_HEADERS is false — regression for M3 IP-spoofing bypass", () => {
    // An attacker can set X-Forwarded-For: any-ip to bypass per-IP rate limits
    // when the server naively trusts this header. Verify it is ignored by default.
    const hdrs = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getRequestIp(hdrs)).toBeNull();
  });

  it("reads x-real-ip when TRUST_PROXY_HEADERS is false (Vercel sets this at the edge)", () => {
    const hdrs = new Headers({ "x-real-ip": "9.10.11.12" });
    expect(getRequestIp(hdrs)).toBe("9.10.11.12");
  });

  it("reads x-real-ip even when x-forwarded-for is also present", () => {
    const hdrs = new Headers({
      "x-forwarded-for": "spoofed.attacker.ip",
      "x-real-ip": "9.10.11.12",
    });
    expect(getRequestIp(hdrs)).toBe("9.10.11.12");
  });

  it("returns null when neither header is present", () => {
    const hdrs = new Headers();
    expect(getRequestIp(hdrs)).toBeNull();
  });
});

describe("getRequestIp — TRUST_PROXY_HEADERS=true (trusted proxy deployment)", () => {
  beforeEach(() => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the first value of x-forwarded-for when TRUST_PROXY_HEADERS is true", () => {
    const hdrs = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getRequestIp(hdrs)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const hdrs = new Headers({ "x-real-ip": "9.10.11.12" });
    expect(getRequestIp(hdrs)).toBe("9.10.11.12");
  });

  it("returns null when neither header is present", () => {
    const hdrs = new Headers();
    expect(getRequestIp(hdrs)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkRateLimit — in-memory implementation
// ---------------------------------------------------------------------------

describe("checkRateLimit (in-memory)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Start at a known timestamp so window boundaries are predictable.
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    _inMemoryStore.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    _inMemoryStore.clear();
  });

  it("allows the first request", async () => {
    const key = makeKey("first");
    const result = await checkRateLimit(
      key,
      { max: 5, windowSeconds: 60 },
      { userId: null, actor: "test", reason: "test" },
    );
    expect(result.allowed).toBe(true);
  });

  it("allows up to max requests within the window (all 5 allowed)", async () => {
    const key = makeKey("within-limit");
    const limit = { max: 5, windowSeconds: 60 };
    const ctx = { userId: null, actor: "test", reason: "test" };

    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(key, limit, ctx);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks the (max+1)th request and returns retryAfterSeconds > 0", async () => {
    const key = makeKey("over-limit");
    const limit = { max: 5, windowSeconds: 60 };
    const ctx = { userId: null, actor: "test", reason: "test" };

    // Consume the limit.
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(key, limit, ctx);
    }

    // The 6th request must be blocked.
    const result = await checkRateLimit(key, limit, ctx);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("resets after the window elapses (allows again after time advance)", async () => {
    const key = makeKey("window-reset");
    const limit = { max: 2, windowSeconds: 60 };
    const ctx = { userId: null, actor: "test", reason: "test" };

    // Exhaust the limit.
    await checkRateLimit(key, limit, ctx);
    await checkRateLimit(key, limit, ctx);
    const blocked = await checkRateLimit(key, limit, ctx);
    expect(blocked.allowed).toBe(false);

    // Advance past the window boundary.
    vi.advanceTimersByTime(61 * 1000);

    // Should be allowed again.
    const allowed = await checkRateLimit(key, limit, ctx);
    expect(allowed.allowed).toBe(true);
  });

  it("FIFO-evicts the oldest key when the map exceeds 10,000 entries", async () => {
    const limit = { max: 100, windowSeconds: 60 };
    const ctx = { userId: null, actor: "test", reason: "test" };

    // Fill the map to capacity using unique keys.
    const firstKey = `evict-test:0`;
    await checkRateLimit(firstKey, limit, ctx);

    for (let i = 1; i < 10_000; i++) {
      await checkRateLimit(`evict-test:${i}`, limit, ctx);
    }

    // Map should be at MAX_MAP_SIZE.
    expect(_inMemoryStore.size).toBe(10_000);
    expect(_inMemoryStore.has(firstKey)).toBe(true);

    // Adding the 10,001st key should evict the first key (FIFO).
    const newKey = `evict-test:overflow`;
    await checkRateLimit(newKey, limit, ctx);

    expect(_inMemoryStore.size).toBe(10_000);
    expect(_inMemoryStore.has(firstKey)).toBe(false);
    expect(_inMemoryStore.has(newKey)).toBe(true);
  });
});
