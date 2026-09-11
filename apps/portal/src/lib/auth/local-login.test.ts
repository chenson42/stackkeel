/**
 * Unit tests for src/lib/auth/local-login.ts
 *
 * Two helpers under test:
 *   isLocalLoginEnabled() — fail-open DB read for the auth.local_login flag
 *   computeEffectiveTwoFactor() — short-circuiting require_2fa gate
 *
 * Mocking strategy:
 *   isLocalLoginEnabled queries the DB directly (same pattern as sign-in-gate.ts)
 *   → mock @/lib/db
 *   computeEffectiveTwoFactor delegates to isFlagEnabled
 *   → mock @/lib/flags
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/lib/db before importing the module under test.
// The DB module throws at import time if DATABASE_URL is unset.
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      featureFlags: {
        findFirst: vi.fn(),
      },
    },
  },
}));

// Mock @/lib/flags for computeEffectiveTwoFactor tests.
vi.mock("@/lib/flags", () => ({
  isFlagEnabled: vi.fn(),
}));

import { isLocalLoginEnabled, computeEffectiveTwoFactor } from "./local-login";
import { db } from "@/lib/db";
import { isFlagEnabled } from "@/lib/flags";

const findFirst = db.query.featureFlags.findFirst as ReturnType<typeof vi.fn>;
const mockIsFlagEnabled = isFlagEnabled as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// isLocalLoginEnabled — four branches
// ---------------------------------------------------------------------------

describe("isLocalLoginEnabled", () => {
  it("row missing (undefined) → true — fail-open when flag is not seeded", async () => {
    findFirst.mockResolvedValue(undefined);

    const result = await isLocalLoginEnabled();

    expect(result).toBe(true);
  });

  it("row.enabled = true → true — admin has credentials enabled", async () => {
    findFirst.mockResolvedValue({ key: "auth.local_login", enabled: true });

    const result = await isLocalLoginEnabled();

    expect(result).toBe(true);
  });

  it("row.enabled = false → false — admin explicitly disabled credentials", async () => {
    findFirst.mockResolvedValue({ key: "auth.local_login", enabled: false });

    const result = await isLocalLoginEnabled();

    expect(result).toBe(false);
  });

  it("DB error (findFirst throws) → true — fail-open during DB blip", async () => {
    findFirst.mockRejectedValue(new Error("connection refused"));

    const result = await isLocalLoginEnabled();

    expect(result).toBe(true);
  });

  it("queries featureFlags exactly once per call", async () => {
    findFirst.mockResolvedValue(undefined);

    await isLocalLoginEnabled();

    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// computeEffectiveTwoFactor — five cases
// ---------------------------------------------------------------------------

describe("computeEffectiveTwoFactor", () => {
  it("rawRequired = false → false without reading the flag (short-circuit)", async () => {
    const result = await computeEffectiveTwoFactor(false);

    expect(result).toBe(false);
    expect(mockIsFlagEnabled).not.toHaveBeenCalled();
  });

  it("rawRequired = true, flag ON → true — org-level gate is active", async () => {
    mockIsFlagEnabled.mockResolvedValue(true);

    const result = await computeEffectiveTwoFactor(true);

    expect(result).toBe(true);
    expect(mockIsFlagEnabled).toHaveBeenCalledWith("auth.require_2fa");
  });

  it("rawRequired = true, flag OFF → false — master switch disables enforcement", async () => {
    mockIsFlagEnabled.mockResolvedValue(false);

    const result = await computeEffectiveTwoFactor(true);

    expect(result).toBe(false);
    expect(mockIsFlagEnabled).toHaveBeenCalledWith("auth.require_2fa");
  });

  it("rawRequired = true, isFlagEnabled throws → rawRequired (pre-feature fallback)", async () => {
    mockIsFlagEnabled.mockRejectedValue(new Error("DB connection refused"));

    const result = await computeEffectiveTwoFactor(true);

    // Falls back to raw column value, NOT fail-open. This reproduces
    // pre-feature behavior: the user still gets twoFactorRequired=true during
    // a DB outage. Correct: we don't want to accidentally ungate TOTP users.
    expect(result).toBe(true);
  });

  it("rawRequired = true, flag missing (isFlagEnabled returns false) → false", async () => {
    // Standard isFlagEnabled returns false on missing row.
    // For require_2fa this is safe: missing flag = no enforcement.
    mockIsFlagEnabled.mockResolvedValue(false);

    const result = await computeEffectiveTwoFactor(true);

    expect(result).toBe(false);
  });
});
