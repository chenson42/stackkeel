/**
 * Regression + new coverage for packages/auth/src/totp-pending.ts.
 *
 * Section 1 is relocated verbatim from apps/portal/src/lib/totp-pending.test.ts
 * (Increment 1 of the 2FA consolidation,
 * apps/portal/docs/work-log/2026-09-07-2fa-consolidation.md Phase 3 —
 * "Update/relocate unit tests", step 4). Its own header explains its origin
 * (N-3 from the 2026-05-17 code review): admin/2fa/page.tsx used to always
 * mint a new secret on every render, invalidating a QR code the user had
 * already scanned. `shouldReuseRow` is a pure replica of the reuse
 * condition inside `getOrCreatePendingEnrollment`, kept because it needs no
 * DB or crypto mocking to exercise the boundary logic precisely.
 *
 * Section 2 is new — neither `getPendingSecret` nor `clearPendingEnrollment`
 * had any test coverage in any of the three original per-app files (Phase 3
 * flagged this explicitly: relocating section 1 does not, on its own, give
 * the promoted module's actually-new-here functions their first coverage).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock() calls are hoisted before imports by Vitest's transform.
// "server-only" throws unconditionally when imported outside Next's own
// webpack build (its whole implementation is that one throw, relied on as a
// build-time bundler guard — see its own package source); Next aliases it
// away in app code, but nothing does that under plain Node/Vitest. Same
// precedent as apps/portal/src/lib/audit.test.ts and
// apps/portal/src/lib/email/queue.test.ts, both of which import files that
// carry the same guard.
vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Section 1 — pure predicate replica (relocated from Portal, unchanged)
// ---------------------------------------------------------------------------

interface PendingRow {
  secretCiphertext: string;
  expiresAt: Date;
}

/**
 * Returns true when the pending row should be reused (i.e. it is non-null and
 * its expiresAt is strictly in the future relative to `now`).
 *
 * This mirrors the condition in packages/auth/src/totp-pending.ts:
 *   if (existing && existing.expiresAt > new Date()) { ... }
 */
function shouldReuseRow(row: PendingRow | null, now: Date): boolean {
  return row !== null && row.expiresAt > now;
}

describe("shouldReuseRow — H1 stable-secret guarantee", () => {
  const PENDING_TTL_MINUTES = 10;

  function makePendingRow(offsetMs: number): PendingRow {
    return {
      secretCiphertext: "test-ciphertext",
      expiresAt: new Date(Date.now() + offsetMs),
    };
  }

  describe("reuses a valid pending row", () => {
    it("returns true for a row expiring in the future", () => {
      const row = makePendingRow(PENDING_TTL_MINUTES * 60 * 1000);
      expect(shouldReuseRow(row, new Date())).toBe(true);
    });

    it("returns true on a second call within the TTL window — the regression case", () => {
      const row = makePendingRow(PENDING_TTL_MINUTES * 60 * 1000);
      const firstRenderNow = new Date();
      const secondRenderNow = new Date(firstRenderNow.getTime() + 5_000);

      expect(shouldReuseRow(row, firstRenderNow)).toBe(true);
      expect(shouldReuseRow(row, secondRenderNow)).toBe(true);
    });

    it("returns true for a row expiring exactly 1 ms from now", () => {
      const row = makePendingRow(1);
      expect(shouldReuseRow(row, new Date())).toBe(true);
    });
  });

  describe("mints a fresh secret when no valid row exists", () => {
    it("returns false when row is null (no pending enrollment)", () => {
      expect(shouldReuseRow(null, new Date())).toBe(false);
    });

    it("returns false for a row whose expiresAt is in the past", () => {
      const row = makePendingRow(-1);
      expect(shouldReuseRow(row, new Date())).toBe(false);
    });

    it("returns false for a row expiring exactly at now (boundary — not strictly future)", () => {
      const now = new Date();
      const row: PendingRow = { secretCiphertext: "x", expiresAt: now };
      expect(shouldReuseRow(row, now)).toBe(false);
    });

    it("returns false for a row that expired minutes ago", () => {
      const row = makePendingRow(-(PENDING_TTL_MINUTES * 60 * 1000 + 1));
      expect(shouldReuseRow(row, new Date())).toBe(false);
    });
  });
});

describe("shouldReuseRow — H2 every app uses identical reuse logic", () => {
  it("produces the same answer for the same row regardless of which app calls it", () => {
    const now = new Date();
    const validRow: PendingRow = {
      secretCiphertext: "ciphertext-abc",
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
    };
    const expiredRow: PendingRow = {
      secretCiphertext: "ciphertext-xyz",
      expiresAt: new Date(now.getTime() - 1),
    };

    expect(shouldReuseRow(validRow, now)).toBe(true);
    expect(shouldReuseRow(validRow, now)).toBe(true); // Portal call
    expect(shouldReuseRow(validRow, now)).toBe(true); // Admin call

    expect(shouldReuseRow(expiredRow, now)).toBe(false);
    expect(shouldReuseRow(expiredRow, now)).toBe(false);
    expect(shouldReuseRow(expiredRow, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 2 — new coverage against the real module, mocked DB + crypto
// ---------------------------------------------------------------------------

const {
  mockDecryptSecret,
  mockEncryptSecret,
  mockGenerateSecret,
  mockOtpauthUrl,
} = vi.hoisted(() => ({
  mockDecryptSecret: vi.fn(),
  mockEncryptSecret: vi.fn(),
  mockGenerateSecret: vi.fn(),
  mockOtpauthUrl: vi.fn(),
}));

vi.mock("./two-factor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./two-factor")>();
  return {
    ...actual,
    decryptSecret: mockDecryptSecret,
    encryptSecret: mockEncryptSecret,
    generateSecret: mockGenerateSecret,
    otpauthUrl: mockOtpauthUrl,
  };
});

import { userTotpPendingEnrollments } from "@repo/db";
import { TotpSecretUndecryptableError } from "./two-factor";
import {
  clearPendingEnrollment,
  getOrCreatePendingEnrollment,
  getPendingSecret,
} from "./totp-pending";

// A minimal fake satisfying only the three call shapes totp-pending.ts uses
// (db.select().from(...).where(...).limit(1), db.insert(...).values(...)
// .onConflictDoUpdate(...), db.delete(...).where(...)) — not a real Drizzle
// client. Switched from a db.query.<table>.findFirst shape to the core
// query builder mid-Phase-4: making the module's `db` parameter generic
// (see totp-pending.ts's own header, "SECOND correction") broke the
// relational query API's type inference, so the real module now reads via
// select().from().where().limit(1) instead. The `where`/target values
// passed by the real module are exercised indirectly (via drizzle-orm's
// real `eq()`, imported by the module under test) but not asserted on
// directly here; that's drizzle's own contract, not this module's.
function makeFakeDb(selectResult: unknown = null) {
  const limit = vi.fn(async () => (selectResult ? [selectResult] : []));
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const onConflictDoUpdate = vi.fn(async () => undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  const deleteWhere = vi.fn(async () => undefined);
  const del = vi.fn(() => ({ where: deleteWhere }));
  return {
    db: {
      select,
      insert,
      delete: del,
    } as unknown as Parameters<typeof getPendingSecret>[0],
    spies: {
      select,
      from,
      where,
      limit,
      insert,
      values,
      onConflictDoUpdate,
      delete: del,
      deleteWhere,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPendingSecret", () => {
  it("returns null when no pending row exists", async () => {
    const { db, spies } = makeFakeDb(null);
    const result = await getPendingSecret(db, "u1");
    expect(result).toBeNull();
    expect(spies.select).toHaveBeenCalledTimes(1);
    expect(mockDecryptSecret).not.toHaveBeenCalled();
  });

  it("returns null when the pending row is expired", async () => {
    const { db } = makeFakeDb({
      secretCiphertext: "ct",
      expiresAt: new Date(Date.now() - 1000),
    });
    const result = await getPendingSecret(db, "u1");
    expect(result).toBeNull();
    expect(mockDecryptSecret).not.toHaveBeenCalled();
  });

  it("returns the decrypted secret for a live, unexpired row", async () => {
    const { db } = makeFakeDb({
      secretCiphertext: "ct-live",
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockDecryptSecret.mockReturnValue("PLAINSECRET");

    const result = await getPendingSecret(db, "u1");

    expect(result).toBe("PLAINSECRET");
    expect(mockDecryptSecret).toHaveBeenCalledWith("ct-live");
  });

  it("returns null, not throw, when the stored secret cannot be decrypted (key rotation)", async () => {
    const { db } = makeFakeDb({
      secretCiphertext: "ct-stale-key",
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockDecryptSecret.mockImplementation(() => {
      throw new TotpSecretUndecryptableError();
    });

    const result = await getPendingSecret(db, "u1");
    expect(result).toBeNull();
  });

  it("rethrows an error that is not TotpSecretUndecryptableError", async () => {
    const { db } = makeFakeDb({
      secretCiphertext: "ct",
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockDecryptSecret.mockImplementation(() => {
      throw new Error("AUTH_TOTP_ENCRYPTION_KEY is not set");
    });

    await expect(getPendingSecret(db, "u1")).rejects.toThrow(
      "AUTH_TOTP_ENCRYPTION_KEY is not set",
    );
  });
});

describe("clearPendingEnrollment", () => {
  it("deletes the pending row for the given user", async () => {
    const { db, spies } = makeFakeDb();
    await clearPendingEnrollment(db, "u1");
    expect(spies.delete).toHaveBeenCalledWith(userTotpPendingEnrollments);
    expect(spies.deleteWhere).toHaveBeenCalledTimes(1);
  });
});

describe("getOrCreatePendingEnrollment", () => {
  it("reuses a live pending row and forwards the issuer to otpauthUrl", async () => {
    const { db, spies } = makeFakeDb({
      secretCiphertext: "ct-live",
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockDecryptSecret.mockReturnValue("REUSEDSECRET");
    mockOtpauthUrl.mockReturnValue("otpauth://reused");

    const result = await getOrCreatePendingEnrollment(
      db,
      "u1",
      "user@example.com",
      "MYAPP",
    );

    expect(result).toEqual({ secret: "REUSEDSECRET", uri: "otpauth://reused" });
    expect(mockOtpauthUrl).toHaveBeenCalledWith(
      "user@example.com",
      "REUSEDSECRET",
      "MYAPP",
    );
    expect(spies.insert).not.toHaveBeenCalled();
  });

  it("omits the issuer argument when none is given, relying on otpauthUrl's own default (Portal's shape)", async () => {
    const { db, spies } = makeFakeDb(null);
    mockGenerateSecret.mockReturnValue("FRESHSECRET");
    mockEncryptSecret.mockReturnValue("fresh-ct");
    mockOtpauthUrl.mockReturnValue("otpauth://fresh");

    const result = await getOrCreatePendingEnrollment(
      db,
      "u1",
      "user@example.com",
    );

    expect(result).toEqual({ secret: "FRESHSECRET", uri: "otpauth://fresh" });
    expect(mockOtpauthUrl).toHaveBeenCalledWith(
      "user@example.com",
      "FRESHSECRET",
      undefined,
    );
    expect(spies.insert).toHaveBeenCalledWith(userTotpPendingEnrollments);
    expect(spies.onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it("mints a fresh secret when the existing row's secret cannot be decrypted (key rotation)", async () => {
    const { db, spies } = makeFakeDb({
      secretCiphertext: "ct-stale-key",
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockDecryptSecret.mockImplementation(() => {
      throw new TotpSecretUndecryptableError();
    });
    mockGenerateSecret.mockReturnValue("ROTATEDSECRET");
    mockEncryptSecret.mockReturnValue("rotated-ct");
    mockOtpauthUrl.mockReturnValue("otpauth://rotated");

    const result = await getOrCreatePendingEnrollment(
      db,
      "u1",
      "user@example.com",
      "ADMIN",
    );

    expect(result).toEqual({
      secret: "ROTATEDSECRET",
      uri: "otpauth://rotated",
    });
    // Falls through to the mint path — a discardable pending row does not
    // lock the user out of re-enrolling.
    expect(spies.insert).toHaveBeenCalledWith(userTotpPendingEnrollments);
    expect(mockOtpauthUrl).toHaveBeenCalledWith(
      "user@example.com",
      "ROTATEDSECRET",
      "ADMIN",
    );
  });
});
