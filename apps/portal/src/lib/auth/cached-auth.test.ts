import { describe, it, expect, vi, beforeEach } from "vitest";

// cached-auth.ts re-exports auth wrapped in React's cache(). We cannot unit-
// test RSC deduplication semantics in Vitest (React's cache() is a no-op
// outside an RSC render pass), so this file verifies the structural invariants
// that must hold regardless of runtime context:
//
//   1. cachedAuth is exported and is callable (typeof function).
//   2. cachedAuth delegates to auth() — not a null stub or an unrelated function.
//
// The actual deduplication benefit (one Tier-A SELECT per /home render instead
// of two) is exercised by the e2e suite against a real dev server. See
// docs/work-log/2026-07-01-flag-caching.md § Phase 3 for the empirical evidence.

// vi.mock is hoisted — factory must not reference variables defined below it.
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { cachedAuth } from "./cached-auth";
import { auth } from "@/auth";

const authMock = auth as ReturnType<typeof vi.fn>;

const mockSession = { user: { id: "test-id", email: "test@example.com" } };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(mockSession);
});

describe("cachedAuth", () => {
  it("is exported as a function", () => {
    expect(typeof cachedAuth).toBe("function");
  });

  it("delegates to auth() and returns its result", async () => {
    const result = await cachedAuth();
    expect(result).toBe(mockSession);
    expect(authMock).toHaveBeenCalledTimes(1);
  });
});
