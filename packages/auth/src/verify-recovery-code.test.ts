// Colocated coverage for verify-recovery-code.ts, matching this package's
// convention (cookies.test.ts, totp-pending.test.ts, post-signin.test.ts
// all live beside their implementation).
import { describe, it, expect, vi } from "vitest";
import { verifyRecoveryCode } from "./verify-recovery-code";
import { hashRecoveryCode, normalizeRecoveryCode } from "./two-factor";

/**
 * A minimal fluent stub covering exactly the chain verify-recovery-code.ts
 * calls: db.select({...}).from(table).where(...).limit(1), and
 * db.update(table).set({...}).where(...). No real DB, no schema import
 * needed for the mock itself.
 */
function makeDbStub(selectRows: { id: string }[]) {
  const setSpy = vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) }));
  const updateSpy = vi.fn(() => ({ set: setSpy }));
  const limitSpy = vi.fn(() => Promise.resolve(selectRows));
  const whereSpy = vi.fn(() => ({ limit: limitSpy }));
  const fromSpy = vi.fn(() => ({ where: whereSpy }));
  const selectSpy = vi.fn(() => ({ from: fromSpy }));
  return {
    db: { select: selectSpy, update: updateSpy } as unknown as Parameters<
      typeof verifyRecoveryCode
    >[0],
    selectSpy,
    updateSpy,
    setSpy,
    whereSpy,
  };
}

describe("verifyRecoveryCode", () => {
  it("rejects malformed input without querying the database", async () => {
    const { db, selectSpy } = makeDbStub([]);
    // Fails normalizeRecoveryCode's own /^[A-Z0-9-]{8,10}$/ shape check
    // (too short, and contains punctuation outside A-Z0-9-).
    const result = await verifyRecoveryCode(db, "user-1", "!!nope!!");
    expect(result).toEqual({ ok: false, reason: "malformed" });
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("rejects a well-formed code with no matching unused row — not_found, no mutation", async () => {
    const { db, updateSpy } = makeDbStub([]);
    const result = await verifyRecoveryCode(db, "user-1", "ABCD-EFGH");
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("accepts a matching code, marks it used (single-use), and returns its id", async () => {
    const { db, updateSpy, setSpy } = makeDbStub([{ id: "code-row-1" }]);
    const result = await verifyRecoveryCode(db, "user-1", "abcd-efgh");
    expect(result).toEqual({ ok: true, codeId: "code-row-1" });
    // Effect, not just invocation: assert the actual mutation shape
    // (usedAt set to a Date), not merely that update() was called.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ usedAt: expect.any(Date) }),
    );
  });

  it("normalizes case/whitespace/hyphenation before hashing (matches normalizeRecoveryCode's own contract)", async () => {
    const normalized = normalizeRecoveryCode("abcd-efgh");
    expect(normalized).not.toBeNull();
    const expectedHash = hashRecoveryCode(normalized!);
    // Not directly assertable without inspecting the where() call args, but
    // this confirms the helper functions verify-recovery-code.ts composes
    // are themselves deterministic and case-insensitive — a wrong-case
    // guess for the SAME underlying code must hash identically.
    const altNormalized = normalizeRecoveryCode(" ABCD-EFGH ");
    expect(altNormalized).toBe(normalized);
    expect(hashRecoveryCode(altNormalized!)).toBe(expectedHash);
  });
});
