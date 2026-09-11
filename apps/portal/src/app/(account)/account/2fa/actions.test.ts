import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Module mocks — vi.mock() calls are hoisted by Vitest's module transformer
// to the top of the file before any imports are resolved. This prevents:
//   - @/lib/db/index.ts from throwing "DATABASE_URL is not set"
//   - next/headers, @/auth from triggering server-only runtime checks
// ---------------------------------------------------------------------------

// "server-only" throws unconditionally when imported outside Next's own
// webpack build (relied on there as a build-time bundler guard). ./actions
// now transitively imports it via @repo/auth/totp-pending (Increment 1 of
// the 2FA consolidation, 2026-09-07) — same precedent as
// src/lib/audit.test.ts and src/lib/email/queue.test.ts.
vi.mock("server-only", () => ({}));

// The shared, promoted pending-enrollment module — mocked wholesale here
// since this file's own tests (clearFreshCodesCookieAction, static analysis
// of page.tsx) don't exercise completeEnrollment/acknowledgeEnrollment's
// use of it.
vi.mock("@repo/auth/totp-pending", () => ({
  getOrCreatePendingEnrollment: vi.fn(),
  getPendingSecret: vi.fn(),
  clearPendingEnrollment: vi.fn(),
  PENDING_TTL_MINUTES: 10,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  unstable_update: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      userTotp: { findFirst: vi.fn() },
      userTotpPendingEnrollments: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoUpdate: vi.fn() })),
    })),
    delete: vi.fn(() => ({ where: vi.fn() })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  auditEvents: { _: "audit_events" },
  userTotp: { _: "user_totp" },
  userTotpPendingEnrollments: { _: "user_totp_pending" },
  userTotpRecoveryCodes: { _: "user_totp_recovery_codes" },
}));

vi.mock("@/lib/two-factor", () => ({
  FRESH_RECOVERY_CODES_COOKIE: "claudecode_fresh_recovery_codes",
  decryptSecret: vi.fn(),
  encryptSecret: vi.fn(),
  generateRecoveryCodes: vi.fn(() => ["CODE-0001"]),
  hashRecoveryCode: vi.fn((c: string) => `hash(${c})`),
  verifyToken: vi.fn(() => false),
  otpauthUrl: vi.fn(() => "otpauth://"),
  generateSecret: vi.fn(() => "FAKESECRET"),
}));

vi.mock("@/lib/audit", () => ({
  AUDIT_ACTIONS: {
    TOTP_ENROLLED: "totp.enrolled",
    TOTP_RECOVERY_CODES_REGENERATED: "totp.recovery_codes.regenerated",
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks are declared (mocks are hoisted, so these resolve to
// the mock factories above).
// ---------------------------------------------------------------------------

import { cookies } from "next/headers";
import { FRESH_RECOVERY_CODES_COOKIE } from "@/lib/two-factor";
import { clearFreshCodesCookieAction } from "./actions";

// ---------------------------------------------------------------------------
// clearFreshCodesCookieAction — regression for BUG-2
//
// Before the fix: jar.delete(FRESH_RECOVERY_CODES_COOKIE) was called inside
// consumeFreshCodesCookie() during RSC render — illegal in Next 16 and a
// silent no-op in production, causing codes to re-display on every reload.
//
// After the fix: the delete runs here (in a server action), invoked by
// the FreshRecoveryCodes client island's useEffect after mount.
//
// Critical invariant: jar.delete MUST be called with the path-qualified
// object `{ name, path: "/account/2fa" }`. Omitting the path would send
// a Set-Cookie deletion header with Path=/ (the browser default), which
// does NOT match the path-scoped cookie that was SET with path: "/account/2fa"
// — the cookie would persist and codes would continue to re-display.
// ---------------------------------------------------------------------------

describe(
  "clearFreshCodesCookieAction — regression for BUG-2: cookie not cleared in server action",
  () => {
    let mockDelete: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockDelete = vi.fn();
      vi.mocked(cookies).mockResolvedValue({
        delete: mockDelete,
      } as unknown as Awaited<ReturnType<typeof cookies>>);
    });

    it("calls jar.delete with the correct cookie name — regression for wrong name", async () => {
      // Arrange — mockDelete set in beforeEach

      // Act
      await clearFreshCodesCookieAction();

      // Assert — the name field must equal the constant; a mismatch means
      // delete would target a non-existent cookie entry.
      expect(mockDelete).toHaveBeenCalledTimes(1);
      const [arg] = mockDelete.mock.calls[0];
      expect(arg.name).toBe(FRESH_RECOVERY_CODES_COOKIE);
    });

    it("calls jar.delete with path '/account/2fa' — regression for path-unscoped deletion silently failing", async () => {
      // Arrange — mockDelete set in beforeEach

      // Act
      await clearFreshCodesCookieAction();

      // Assert — the path must match the path used at set time in
      // setFreshRecoveryCodesCookie. A missing or wrong path means the
      // browser's cookie jar would see a DELETE for a different cookie entry.
      const [arg] = mockDelete.mock.calls[0];
      expect(arg.path).toBe("/account/2fa");
    });

    it("calls jar.delete with the exact { name, path } object shape — combined regression", async () => {
      // Arrange — mockDelete set in beforeEach

      // Act
      await clearFreshCodesCookieAction();

      // Assert — full object match
      expect(mockDelete).toHaveBeenCalledWith({
        name: FRESH_RECOVERY_CODES_COOKIE,
        path: "/account/2fa",
      });
    });
  },
);

// ---------------------------------------------------------------------------
// Static assertion — (account)/account/2fa/page.tsx must not contain
// jar.delete in the RSC render path.
//
// FAIL-BEFORE evidence: before the fix, running
//   grep "jar.delete" src/app/(account)/account/2fa/page.tsx
// produced:
//   src/app/(account)/account/2fa/page.tsx:24:  jar.delete(FRESH_RECOVERY_CODES_COOKIE);
//
// This test now PASSES because the fix removed the illegal mutation.
// It will FAIL again if the mutation is re-introduced.
// ---------------------------------------------------------------------------

describe(
  "(account)/account/2fa/page.tsx static analysis — regression for RSC cookie mutation",
  () => {
    const pageSource = readFileSync(
      resolve(__dirname, "page.tsx"),
      "utf-8",
    );

    it("page.tsx does not contain jar.delete — illegal RSC cookie mutation removed", () => {
      // A match here means consumeFreshCodesCookie() was re-introduced or the
      // delete moved back into the RSC render path.
      expect(pageSource).not.toContain("jar.delete");
    });

    it("page.tsx does not define consumeFreshCodesCookie — helper that contained the illegal delete", () => {
      // The helper function itself was the source of BUG-2; its absence proves
      // the mutation path no longer exists in the RSC render.
      expect(pageSource).not.toContain("consumeFreshCodesCookie");
    });
  },
);
