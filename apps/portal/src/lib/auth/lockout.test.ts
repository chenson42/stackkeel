/**
 * Tests for src/lib/auth/lockout.ts
 *
 * checkLockout() is pure and synchronous — no DB mock needed.
 * Six test cases per the Phase 3 design specification.
 */

import { describe, it, expect } from "vitest";
import {
  checkLockout,
  LOCKOUT_THRESHOLD,
  LOCKOUT_DURATION_SECONDS,
} from "./lockout";

describe("checkLockout() — pure lockout state evaluation", () => {
  const now = new Date("2026-07-01T12:00:00.000Z");

  it("fresh user (lockedUntil=null) → not locked, counter not reset", () => {
    const result = checkLockout(
      { failedLoginAttempts: 0, lockedUntil: null },
      now,
    );
    expect(result).toEqual({ locked: false, resetCounter: false });
  });

  it("active lock (lockedUntil > now) → locked, counter not reset", () => {
    const future = new Date(now.getTime() + 60_000); // +60s
    const result = checkLockout(
      { failedLoginAttempts: 5, lockedUntil: future },
      now,
    );
    expect(result).toEqual({ locked: true, resetCounter: false });
  });

  it("expired lock (lockedUntil 1ms in the past) → not locked, counter should reset", () => {
    const past = new Date(now.getTime() - 1); // 1ms before now
    const result = checkLockout(
      { failedLoginAttempts: 5, lockedUntil: past },
      now,
    );
    expect(result).toEqual({ locked: false, resetCounter: true });
  });

  it("boundary: lockedUntil === now → treated as expired (not strictly future) → resetCounter", () => {
    const result = checkLockout(
      { failedLoginAttempts: 5, lockedUntil: now },
      now,
    );
    // lockedUntil > now is false when equal, so this falls through to expiry branch.
    expect(result).toEqual({ locked: false, resetCounter: true });
  });

  it("high counter (4) with null lockedUntil → not locked (checkLockout is lockedUntil-only)", () => {
    // The threshold enforcement lives in the SQL CASE WHEN expression, not here.
    // checkLockout() only inspects lockedUntil.
    const result = checkLockout(
      { failedLoginAttempts: 4, lockedUntil: null },
      now,
    );
    expect(result).toEqual({ locked: false, resetCounter: false });
  });
});

describe("lockout constants — sanity check", () => {
  it("LOCKOUT_THRESHOLD is 5 and LOCKOUT_DURATION_SECONDS is 900", () => {
    expect(LOCKOUT_THRESHOLD).toBe(5);
    expect(LOCKOUT_DURATION_SECONDS).toBe(900);
  });
});
