/**
 * Unit tests for evaluateSignIn — the extracted NextAuth signIn-callback gate.
 *
 * REGRESSION EVIDENCE (test 1):
 *
 *   The old signIn callback in src/auth.ts (lines 127–138, pre-fix) used an
 *   id-keyed DB lookup:
 *
 *     if (!user.id) return true;  // brand-new OAuth user; adapter will create
 *     const dbUser = await db.query.users.findFirst({
 *       where: eq(users.id, user.id),
 *       ...
 *     });
 *     if (!dbUser) return false;  // <— BUG: always hits on first OAuth sign-in
 *     return dbUser.isActive;
 *
 *   On a first-time Google OAuth sign-in, user.id is Google's `sub` string
 *   (e.g. "117483729384657382910"), never a DB UUID. The findFirst misses,
 *   !dbUser is true, and the callback returns false — every new OAuth user
 *   gets AccessDenied. The old logic is faithfully encoded in `simulateOldLogic`
 *   below; test 1 (OLD LOGIC) shows it failing, and test 1 (NEW LOGIC) shows
 *   the fix passing.
 */

import { describe, it, expect, vi } from "vitest";
import { evaluateSignIn } from "./sign-in-gate";

// ---------------------------------------------------------------------------
// Faithful encoding of the OLD (pre-fix) id-keyed callback logic.
// Used only to demonstrate the regression in test 1.
// ---------------------------------------------------------------------------
async function simulateOldLogic(
  userId: string | null | undefined,
  findById: (id: string) => Promise<{ isActive: boolean } | null>,
): Promise<boolean> {
  if (!userId) return true; // guard that was present but irrelevant for Google
  const dbUser = await findById(userId);
  if (!dbUser) return false; // the failing branch for new OAuth users
  return dbUser.isActive;
}

describe("evaluateSignIn", () => {
  // -------------------------------------------------------------------------
  // Test 1 — New OAuth user (no existing row) → must be ALLOWED
  //
  // REGRESSION: the old id-keyed logic returns false for this exact case
  // because no row exists keyed to Google's sub string. Demonstrated below.
  // -------------------------------------------------------------------------
  describe("new OAuth user (no existing row)", () => {
    const findUserByEmail = vi.fn().mockResolvedValue(null);
    const googleSubAsId = "117483729384657382910"; // Google sub, not a DB UUID

    it("OLD LOGIC — returns false (bug: new OAuth user is rejected)", async () => {
      // Simulate the old lookup: findById with Google's sub → no row → false
      const findById = vi.fn().mockResolvedValue(null);
      const result = await simulateOldLogic(googleSubAsId, findById);
      // This assertion PASSES, confirming the bug: old code returned false for
      // a brand-new OAuth user, blocking them with AccessDenied.
      expect(result).toBe(false);
    });

    it("NEW LOGIC — returns true (fix: new OAuth user is allowed through)", async () => {
      const result = await evaluateSignIn(
        "google",
        { id: googleSubAsId, email: "new@example.com" },
        findUserByEmail,
      );
      expect(result).toBe(true);
      expect(findUserByEmail).toHaveBeenCalledWith("new@example.com");
    });
  });

  // -------------------------------------------------------------------------
  // Test 2 — Deactivated OAuth user → must be BLOCKED
  // Confirms the soft-deactivation gate is not weakened by the fix.
  // -------------------------------------------------------------------------
  it("deactivated OAuth user — returns false", async () => {
    const findUserByEmail = vi
      .fn()
      .mockResolvedValue({ isActive: false });

    const result = await evaluateSignIn(
      "google",
      { email: "dead@example.com" },
      findUserByEmail,
    );

    expect(result).toBe(false);
    expect(findUserByEmail).toHaveBeenCalledWith("dead@example.com");
  });

  // -------------------------------------------------------------------------
  // Test 3 — Credentials provider → must return true WITHOUT calling findUserByEmail.
  // authorize() already enforced isActive; the second lookup is a dead round-trip.
  // -------------------------------------------------------------------------
  it("credentials provider — returns true and does not call findUserByEmail", async () => {
    const findUserByEmail = vi.fn();

    const result = await evaluateSignIn(
      "credentials",
      { id: "a-real-db-uuid", email: "user@example.com" },
      findUserByEmail,
    );

    expect(result).toBe(true);
    expect(findUserByEmail).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 4 — OAuth user with no email → fail-safe; must return false.
  // -------------------------------------------------------------------------
  it("OAuth user with no email — returns false (fail-safe)", async () => {
    const findUserByEmail = vi.fn();

    const result = await evaluateSignIn("google", {}, findUserByEmail);

    expect(result).toBe(false);
    expect(findUserByEmail).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 5 — Email case-insensitivity: mixed-case provider email finds the
  // lowercased row in the DB.
  // -------------------------------------------------------------------------
  it("OAuth with mixed-case email — looks up with lowercased email", async () => {
    const findUserByEmail = vi
      .fn()
      .mockResolvedValue({ isActive: true });

    const result = await evaluateSignIn(
      "google",
      { email: "User.Name@Example.COM" },
      findUserByEmail,
    );

    expect(result).toBe(true);
    expect(findUserByEmail).toHaveBeenCalledWith("user.name@example.com");
  });
});
