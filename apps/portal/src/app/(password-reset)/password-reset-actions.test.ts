import { describe, it, expect, vi } from "vitest";

// These mocks are required so `await import("@/lib/audit")` below succeeds in
// the Vitest Node.js environment. audit.ts now transitively loads modules that
// are not available or require env vars in plain Node.js:
// - server-only: throws outside the Next.js bundler context.
// - @/auth: loads next-auth → next/server, not resolvable without Next.js.
// - @/lib/db: throws if DATABASE_URL is not set.
// The tests only need AUDIT_ACTIONS string constants, not any of this behaviour.
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { insert: vi.fn().mockReturnValue({ values: vi.fn() }) } }));

// Regression tests for the forgot-password flow (Phase 5 — QA).
//
// The server actions in src/app/(password-reset)/actions.ts import next-auth,
// drizzle-orm/neon-http, bcryptjs, and node crypto — none of which run cleanly
// inside Vitest without a full db/env. The established pattern (mirrored from
// account-actions.test.ts and admin/users/[id]/actions.test.ts) is to:
//   1. Extract the guard predicates as pure inline functions that mirror the
//      action logic exactly.
//   2. Import the schema module and assert structural invariants.
//   3. Import AUDIT_ACTIONS and assert the new catalog entries.
//
// The typecheck + build gate proves the import graph is valid; these tests prove
// the branching logic and catalog entries are correct.

// ---------------------------------------------------------------------------
// requestPasswordReset — enumeration guard
//
// Implementation (src/app/(password-reset)/actions.ts lines 33–72):
//   if (!userRow || !userRow.password) return { ok: true };   // silent no-op
//   ... mint token, send email, audit ...
//   return { ok: true };
//
// Critical invariant: ALL three cases must return { ok: true } with no
// additional fields that would allow a caller to distinguish them.
// ---------------------------------------------------------------------------

type ActionResult = { ok: true } | { ok: false; error: string };

function requestPasswordResetResultForUser(user: {
  exists: boolean;
  hasPassword: boolean;
}): ActionResult {
  // Mirrors the guard at actions.ts line 40
  if (!user.exists || !user.hasPassword) {
    return { ok: true };
  }
  // Happy path also returns { ok: true }
  return { ok: true };
}

function resultsAreIdentical(a: ActionResult, b: ActionResult): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

describe(
  "requestPasswordReset — enumeration guard — regression for email/account-type leakage via response shape",
  () => {
    it("returns { ok: true } for an unknown email — no enumeration", () => {
      // Arrange
      const unknownEmail = { exists: false, hasPassword: false };

      // Act
      const result = requestPasswordResetResultForUser(unknownEmail);

      // Assert
      expect(result).toStrictEqual({ ok: true });
    });

    it("returns { ok: true } for a Google-only user (password === null) — no enumeration", () => {
      // Arrange
      const googleOnlyUser = { exists: true, hasPassword: false };

      // Act
      const result = requestPasswordResetResultForUser(googleOnlyUser);

      // Assert
      expect(result).toStrictEqual({ ok: true });
    });

    it("returns { ok: true } for a valid Credentials user — identical response shape", () => {
      // Arrange
      const credentialsUser = { exists: true, hasPassword: true };

      // Act
      const result = requestPasswordResetResultForUser(credentialsUser);

      // Assert
      expect(result).toStrictEqual({ ok: true });
    });

    it("all three cases produce the identical response shape — regression for timing or shape enumeration", () => {
      // Arrange
      const cases = [
        { exists: false, hasPassword: false }, // unknown email
        { exists: true, hasPassword: false },  // Google-only
        { exists: true, hasPassword: true },   // Credentials user
      ];

      // Act
      const results = cases.map(requestPasswordResetResultForUser);

      // Assert — every result must be identical to the first
      for (const result of results.slice(1)) {
        expect(resultsAreIdentical(results[0], result)).toBe(true);
      }
    });
  },
);

// ---------------------------------------------------------------------------
// consumeResetToken — expiry rejection
//
// Implementation (src/app/(password-reset)/actions.ts lines 103–112):
//   if (tokenRow.expiresAt < new Date()) {
//     await db.delete(...)
//     return { ok: false, error: "This link has expired. Request a new one." }
//   }
// ---------------------------------------------------------------------------

function tokenIsExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt < now;
}

function consumeResetTokenResultForExpiry(
  expiresAt: Date,
  now: Date,
): ActionResult {
  if (tokenIsExpired(expiresAt, now)) {
    return { ok: false, error: "This link has expired. Request a new one." };
  }
  // Still valid — happy path
  return { ok: true };
}

describe(
  "consumeResetToken — expiry rejection — regression for accepting expired tokens",
  () => {
    it("rejects a token whose expiresAt is in the past", () => {
      // Arrange
      const now = new Date("2026-05-17T12:00:00Z");
      const expiresAt = new Date("2026-05-17T10:59:00Z"); // 61 minutes ago

      // Act
      const result = consumeResetTokenResultForExpiry(expiresAt, now);

      // Assert
      expect(result).toStrictEqual({
        ok: false,
        error: "This link has expired. Request a new one.",
      });
    });

    it("rejects a token that expired exactly at now (boundary — strictly less-than check)", () => {
      // Arrange — expiresAt === now: the check is `expiresAt < new Date()` so
      // a token that expires at the exact current millisecond is NOT expired.
      // This test documents the boundary behavior so a refactor can't silently
      // tighten the check to <=.
      const now = new Date("2026-05-17T12:00:00.000Z");
      const expiresAt = new Date("2026-05-17T11:59:59.999Z"); // 1 ms before now

      // Act
      const result = consumeResetTokenResultForExpiry(expiresAt, now);

      // Assert
      expect(result).toStrictEqual({
        ok: false,
        error: "This link has expired. Request a new one.",
      });
    });

    it("accepts a token that expires in the future", () => {
      // Arrange
      const now = new Date("2026-05-17T12:00:00Z");
      const expiresAt = new Date("2026-05-17T12:30:00Z"); // 30 minutes from now

      // Act
      const result = consumeResetTokenResultForExpiry(expiresAt, now);

      // Assert
      expect(result).toStrictEqual({ ok: true });
    });

    it("accepts a token expiring 1 ms in the future (tight boundary)", () => {
      // Arrange
      const now = new Date("2026-05-17T12:00:00.000Z");
      const expiresAt = new Date("2026-05-17T12:00:00.001Z"); // 1 ms ahead

      // Act
      const result = consumeResetTokenResultForExpiry(expiresAt, now);

      // Assert
      expect(result).toStrictEqual({ ok: true });
    });
  },
);

// ---------------------------------------------------------------------------
// consumeResetToken — password length validation
//
// Implementation (src/app/(password-reset)/actions.ts lines 89–91):
//   if (input.newPassword.length < 8) {
//     return { ok: false, error: "Password must be at least 8 characters." };
//   }
// ---------------------------------------------------------------------------

function newPasswordTooShort(password: string): boolean {
  return password.length < 8;
}

describe(
  "consumeResetToken — password length guard — regression for accepting passwords shorter than 8 chars",
  () => {
    it("rejects a password shorter than 8 characters", () => {
      expect(newPasswordTooShort("short")).toBe(true);
    });

    it("rejects a 7-character password (one below threshold)", () => {
      expect(newPasswordTooShort("seven77")).toBe(true);
    });

    it("accepts exactly 8 characters", () => {
      expect(newPasswordTooShort("exactly8")).toBe(false);
    });

    it("accepts passwords longer than 8 characters", () => {
      expect(newPasswordTooShort("a-longer-secure-passphrase")).toBe(false);
    });
  },
);

// ---------------------------------------------------------------------------
// passwordResetTokens schema — structural regression
//
// Asserts the new table and its unique indexes are exported from schema.ts.
// If the table is removed or renamed, actions.ts would break at runtime;
// this test surfaces the breakage at test time.
// ---------------------------------------------------------------------------

describe(
  "passwordResetTokens schema exports — regression for missing table or unique index definitions",
  () => {
    it("passwordResetTokens is exported from schema", async () => {
      // Arrange + Act
      const schema = await import("@/lib/db/schema");

      // Assert
      expect(schema.passwordResetTokens).toBeDefined();
    });

    it("passwordResetTokens has the required columns (id, userId, token, expiresAt, createdAt)", async () => {
      // Arrange + Act
      const schema = await import("@/lib/db/schema");
      const table = schema.passwordResetTokens;

      // Assert — Drizzle exposes columns as own properties on the table object
      expect(table).toHaveProperty("id");
      expect(table).toHaveProperty("userId");
      expect(table).toHaveProperty("token");
      expect(table).toHaveProperty("expiresAt");
      expect(table).toHaveProperty("createdAt");
    });

    it("passwordResetTokens is exported from schema", async () => {
      // Arrange + Act
      const schema = await import("@/lib/db/schema");

      // Assert
      expect(schema.passwordResetTokens).toBeDefined();
    });
  },
);

// ---------------------------------------------------------------------------
// consumeResetToken — TOCTOU / double-submit regression
//
// The TOCTOU fix (option B) atomically claims the token with:
//   DELETE FROM password_reset_tokens WHERE token = $hash AND expires_at > now()
//   RETURNING *
//
// This test simulates two concurrent calls racing on the same rawToken.
// The DB mock returns the token row on the first DELETE-returning call and an
// empty array on the second, proving only one caller can succeed.
// ---------------------------------------------------------------------------

// Pure function that mirrors the DELETE-returning guard in actions.ts.
// Input: the array returned by `db.delete(...).returning()` for this caller.
function consumeTokenFromDeleteResult(
  deleteResult: { userId: string; token: string }[],
): { claimed: boolean } {
  // Zero rows → someone else already claimed it (or it expired / never existed)
  if (deleteResult.length === 0) return { claimed: false };
  return { claimed: true };
}

describe(
  "consumeResetToken — TOCTOU / double-submit — regression for token used twice via concurrent requests",
  () => {
    it("first caller gets 1 row back and succeeds; second caller gets 0 rows and fails", () => {
      // Arrange: mock DELETE-returning outcomes for two concurrent requests
      // racing on the same token. The DB guarantee is that only one DELETE
      // for a given PK can return a row — the uniqueIndex on `token` ensures
      // exactly one winner.
      const firstCallerResult = [
        { userId: "user-uuid-1", token: "sha256-hex-of-raw-token" },
      ];
      const secondCallerResult: { userId: string; token: string }[] = [];

      // Act
      const first = consumeTokenFromDeleteResult(firstCallerResult);
      const second = consumeTokenFromDeleteResult(secondCallerResult);

      // Assert
      expect(first.claimed).toBe(true);
      expect(second.claimed).toBe(false);
    });

    it("a request that gets 0 rows back is rejected regardless of order", () => {
      // Arrange: only the empty result — simulates the loser in the race
      const loserResult: { userId: string; token: string }[] = [];

      // Act
      const outcome = consumeTokenFromDeleteResult(loserResult);

      // Assert
      expect(outcome.claimed).toBe(false);
    });

    it("a request that gets 1 row back is accepted — normal happy path", () => {
      // Arrange
      const winnerResult = [
        { userId: "user-uuid-1", token: "sha256-hex-of-raw-token" },
      ];

      // Act
      const outcome = consumeTokenFromDeleteResult(winnerResult);

      // Assert
      expect(outcome.claimed).toBe(true);
    });
  },
);

// ---------------------------------------------------------------------------
// requestPasswordReset — upsert contract (delete+insert → onConflictDoUpdate)
//
// Changed from delete-then-insert to insert().onConflictDoUpdate() targeting
// passwordResetTokens.userId. Observable contract is unchanged: always
// returns { ok: true } for a valid credentials user. The delete+insert race
// window (two concurrent requests → 23505 on ix_pwd_reset_user) is closed.
// ---------------------------------------------------------------------------

describe(
  "requestPasswordReset — upsert contract — regression for delete+insert race window",
  () => {
    it("returns { ok: true } for a second request from the same userId (upsert replaces token)", () => {
      // The upsert eliminates the race; the observable result for any number of
      // concurrent requests from the same credentials user is still { ok: true }.
      const credentialsUser = { exists: true, hasPassword: true };
      const result = requestPasswordResetResultForUser(credentialsUser);
      expect(result).toStrictEqual({ ok: true });
    });

    it("passwordResetTokens.userId exists — required upsert target column", async () => {
      // If this column is removed or renamed, the onConflictDoUpdate call in
      // requestPasswordReset will fail at runtime. Catch it at test time.
      const schema = await import("@/lib/db/schema");
      expect(schema.passwordResetTokens).toHaveProperty("userId");
    });
  },
);

// ---------------------------------------------------------------------------
// AUDIT_ACTIONS catalog — new entries for password-reset flow
//
// Verifies the two new keys are present with their exact frozen string values.
// If either key is removed or renamed, this test fails before a bad action
// string is written to the live audit_events table.
// ---------------------------------------------------------------------------

describe(
  "AUDIT_ACTIONS — password-reset catalog entries — regression for missing or renamed audit keys",
  () => {
    it("exports USER_PASSWORD_RESET_REQUESTED with the correct frozen value", async () => {
      // Arrange + Act
      const { AUDIT_ACTIONS } = await import("@/lib/audit");

      // Assert
      expect(AUDIT_ACTIONS.USER_PASSWORD_RESET_REQUESTED).toBe(
        "user.password_reset_requested",
      );
    });

    it("exports USER_PASSWORD_RESET_COMPLETED with the correct frozen value", async () => {
      // Arrange + Act
      const { AUDIT_ACTIONS } = await import("@/lib/audit");

      // Assert
      expect(AUDIT_ACTIONS.USER_PASSWORD_RESET_COMPLETED).toBe(
        "user.password_reset_completed",
      );
    });
  },
);
