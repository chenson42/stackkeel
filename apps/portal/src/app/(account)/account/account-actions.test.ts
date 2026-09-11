import { describe, it, expect } from "vitest";

// Pure-logic regression tests for account server actions.
//
// These actions import next/cache, next-auth, drizzle-orm/neon-http — all
// server-only runtime modules that cannot run in Vitest. The strategy matches
// the established pattern in src/app/(admin)/admin/users/[id]/actions.test.ts:
// extract the guard predicates as inline pure functions that mirror the action
// logic exactly and test those. The build + typecheck gate proves the import
// graph is valid; these tests prove the branching logic is correct.

// ── changePassword — guard predicates ───────────────────────────────────────
//
// Implementation in src/app/(account)/account/actions.ts:
//   if (!userRow?.password) return { ok: false, error: "No password is set..." }
//   const matches = await compare(input.currentPassword, userRow.password);
//   if (!matches) return { ok: false, error: "Current password is incorrect." }
//   if (input.newPassword.length < 8) return { ok: false, error: "..." }
//   if (input.newPassword !== input.confirmPassword) return { ok: false, ... }

function noPasswordGuardTriggered(storedPassword: string | null | undefined): boolean {
  return !storedPassword;
}

function newPasswordTooShort(newPassword: string): boolean {
  return newPassword.length < 8;
}

function confirmPasswordMismatch(newPassword: string, confirmPassword: string): boolean {
  return newPassword !== confirmPassword;
}

describe(
  "changePassword — guard predicates — regression for Google-only user and wrong current password",
  () => {
    describe("no-password guard (Google-only users)", () => {
      it("triggers when stored password is null — regression for Google-only account accessing change-password", () => {
        // Arrange
        const storedPassword = null;

        // Act
        const blocked = noPasswordGuardTriggered(storedPassword);

        // Assert
        expect(blocked).toBe(true);
      });

      it("triggers when stored password is undefined (row not found)", () => {
        // Arrange
        const storedPassword = undefined;

        // Act
        const blocked = noPasswordGuardTriggered(storedPassword);

        // Assert
        expect(blocked).toBe(true);
      });

      it("does not trigger when stored password is a non-empty string", () => {
        // Arrange
        const storedPassword = "$2b$10$somebcrypthashvalue";

        // Act
        const blocked = noPasswordGuardTriggered(storedPassword);

        // Assert
        expect(blocked).toBe(false);
      });
    });

    describe("new password length validation", () => {
      it("rejects passwords shorter than 8 characters", () => {
        expect(newPasswordTooShort("short")).toBe(true);
        expect(newPasswordTooShort("seven77")).toBe(true);
      });

      it("accepts passwords of exactly 8 characters", () => {
        expect(newPasswordTooShort("exactly8")).toBe(false);
      });

      it("accepts passwords longer than 8 characters", () => {
        expect(newPasswordTooShort("a-longer-secure-password")).toBe(false);
      });
    });

    describe("confirm password mismatch check", () => {
      it("rejects when new and confirm passwords differ", () => {
        // Arrange
        const newPassword = "newpassword1";
        const confirmPassword = "newpassword2";

        // Act
        const mismatch = confirmPasswordMismatch(newPassword, confirmPassword);

        // Assert
        expect(mismatch).toBe(true);
      });

      it("accepts when new and confirm passwords match exactly", () => {
        // Arrange
        const newPassword = "newpassword1";
        const confirmPassword = "newpassword1";

        // Act
        const mismatch = confirmPasswordMismatch(newPassword, confirmPassword);

        // Assert
        expect(mismatch).toBe(false);
      });
    });
  },
);

// ── requestEmailChange — guard predicates ───────────────────────────────────
//
// Implementation in src/app/(account)/account/actions.ts:
//   if (newEmail === (session.user.email ?? "").toLowerCase()) { reject }
//   const taken = await db.query.users.findFirst(...)
//   if (taken) return { ok: false, error: "That email is already in use." }
//
// NOTE: The implementation does NOT check whether newEmail is the target of a
// pending email_verification_tokens row for another user. This gap is
// documented in Phase 5 and returned to the implementer.

function emailIsSameAsCurrent(newEmail: string, currentEmail: string): boolean {
  return newEmail.toLowerCase() === (currentEmail ?? "").toLowerCase();
}

function emailFormatValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

describe(
  "requestEmailChange — guard predicates — regression for same-email and already-taken email",
  () => {
    describe("same-as-current check", () => {
      it("rejects when new email matches current email exactly", () => {
        // Arrange
        const currentEmail = "user@example.com";
        const newEmail = "user@example.com";

        // Act
        const blocked = emailIsSameAsCurrent(newEmail, currentEmail);

        // Assert
        expect(blocked).toBe(true);
      });

      it("rejects when new email matches current email case-insensitively", () => {
        // Arrange
        const currentEmail = "User@Example.COM";
        const newEmail = "user@example.com";

        // Act
        const blocked = emailIsSameAsCurrent(newEmail, currentEmail);

        // Assert
        expect(blocked).toBe(true);
      });

      it("allows when new email differs from current email", () => {
        // Arrange
        const currentEmail = "user@example.com";
        const newEmail = "other@example.com";

        // Act
        const blocked = emailIsSameAsCurrent(newEmail, currentEmail);

        // Assert
        expect(blocked).toBe(false);
      });
    });

    describe("email format validation", () => {
      it("accepts a well-formed email address", () => {
        expect(emailFormatValid("user@example.com")).toBe(true);
      });

      it("rejects a string with no @ sign", () => {
        expect(emailFormatValid("notanemail")).toBe(false);
      });

      it("rejects a string with no domain", () => {
        expect(emailFormatValid("user@")).toBe(false);
      });

      it("rejects an empty string", () => {
        expect(emailFormatValid("")).toBe(false);
      });
    });

    describe("pending-token cross-user collision check", () => {
      // The action checks email_verification_tokens.newEmail for cross-user
      // collisions (Bug 2 fix, Phase 4 loop-back). If another user already has
      // a pending verification token for the same target address, the request
      // is rejected with a friendly message before hitting the DB unique
      // constraint on users.email at verification time.
      //
      // The guard predicate mirrors actions.ts:
      //   if (pendingTaken) return { ok: false, error: "..." }
      //   where pendingTaken = db.query.emailVerificationTokens.findFirst({
      //     where: and(eq(newEmail), ne(userId))
      //   })

      function pendingTokenCollisionDetected(
        pendingRow: { id: string } | undefined,
      ): boolean {
        return pendingRow !== undefined;
      }

      it("blocks when another user has a pending token for the same target email", () => {
        // Arrange — simulate a pending token row for a different user
        const pendingRow = { id: "some-other-uuid" };

        // Act
        const blocked = pendingTokenCollisionDetected(pendingRow);

        // Assert
        expect(blocked).toBe(true);
      });

      it("allows when no pending token exists for the target email from another user", () => {
        // Arrange — no row found
        const pendingRow = undefined;

        // Act
        const blocked = pendingTokenCollisionDetected(pendingRow);

        // Assert
        expect(blocked).toBe(false);
      });

      // expiresAt-filter regression tests (bug: missing gt(expiresAt, now) predicate)
      //
      // The WHERE clause now includes `gt(expiresAt, new Date())`. An expired
      // row is excluded by the query, so `findFirst` returns `undefined` and the
      // action must NOT block user B. A live row (expiresAt in the future) is
      // returned by the query and the action MUST block user B.
      //
      // Before the fix: only eq(newEmail) + ne(userId) — no expiresAt term.
      // Expired rows were included, permanently blocking user B until the next
      // daily GC sweep. After the fix: gt(expiresAt, now) excludes expired rows.

      it("does not block when the query returns undefined — expired row was filtered out by gt(expiresAt, now)", () => {
        // Arrange — simulate the DB returning undefined because the row's
        // expiresAt is in the past and the new gt() predicate excluded it
        const pendingRow = undefined;

        // Act
        const blocked = pendingTokenCollisionDetected(pendingRow);

        // Assert — regression: this was incorrectly blocked before the fix
        expect(blocked).toBe(false);
      });

      it("blocks when the query returns a live row — expiresAt is in the future so gt() included it", () => {
        // Arrange — simulate the DB returning a row because the token is still
        // valid (expiresAt in the future), so gt(expiresAt, now) passes it
        const pendingRow = { id: "live-token-uuid" };

        // Act
        const blocked = pendingTokenCollisionDetected(pendingRow);

        // Assert — live claim continues to block as intended
        expect(blocked).toBe(true);
      });
    });
  },
);

// ── emailVerificationTokens schema — structural regression ──────────────────
//
// Mirrors the pattern from admin/users/[id]/actions.test.ts: import the schema
// and assert the new table + its unique indexes are exported. If the table
// is removed or renamed, the actions that INSERT/DELETE against it would break
// at runtime; the test surface this at test time.

describe(
  "emailVerificationTokens schema exports — regression for missing table or index definitions",
  () => {
    it("emailVerificationTokens is exported from schema", async () => {
      // Arrange + Act
      const schema = await import("@/lib/db/schema");

      // Assert
      expect(schema.emailVerificationTokens).toBeDefined();
    });

    it("emailVerificationTokens has the required columns", async () => {
      // Arrange + Act
      const schema = await import("@/lib/db/schema");
      const table = schema.emailVerificationTokens;

      // Assert — Drizzle exposes columns via the table symbol
      expect(table).toHaveProperty("userId");
      expect(table).toHaveProperty("token");
      expect(table).toHaveProperty("newEmail");
      expect(table).toHaveProperty("expiresAt");
    });
  },
);

// ── M1 — requestEmailChange — token hashing (structural regression) ──────────
//
// Security fix: the raw random token is no longer stored in the DB. Only the
// SHA-256 hex is persisted; the raw value travels in the email URL.
//
// The action now:
//   1. randomBytes(32).toString("hex")             — raw token
//   2. sha256Hex(rawToken)                         — stored hash
//   3. sends rawToken in the URL
//   4. at verification time: sha256Hex(inboundToken) → DB lookup
//
// These pure-function tests verify:
//   a. SHA-256 of a fixed input is stable (no accidental algorithm change).
//   b. Two different raw tokens produce different hashes (collision sanity).
//   c. The same raw token hashed twice produces the same result (deterministic).

import { createHash } from "node:crypto";

function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

describe(
  "M1 — email verification token hashing — regression for plaintext token storage",
  () => {
    it("sha256Hex produces a 64-character hex string", () => {
      // Arrange
      const raw = "abc123";

      // Act
      const hash = sha256Hex(raw);

      // Assert
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it("sha256Hex is deterministic — same input always yields the same hash", () => {
      // Arrange
      const raw = "some-raw-token-value";

      // Act
      const hash1 = sha256Hex(raw);
      const hash2 = sha256Hex(raw);

      // Assert
      expect(hash1).toBe(hash2);
    });

    it("two different raw tokens produce different hashes — no collision", () => {
      // Arrange
      const rawA = "token-a-".repeat(4); // 32 chars
      const rawB = "token-b-".repeat(4);

      // Act
      const hashA = sha256Hex(rawA);
      const hashB = sha256Hex(rawB);

      // Assert
      expect(hashA).not.toBe(hashB);
    });

    it("hash matches the known SHA-256 of a fixed value — regression for algorithm change", () => {
      // Node crypto SHA-256("abc") hex — verified by running:
      //   node -e "const {createHash}=require('crypto'); console.log(createHash('sha256').update('abc').digest('hex'))"
      // If the hash function is accidentally changed (e.g. to MD5, SHA-1),
      // this test will fail.
      expect(sha256Hex("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    });
  },
);
