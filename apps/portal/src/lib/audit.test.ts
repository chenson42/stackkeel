/**
 * Tests for src/lib/audit.ts
 *
 * Two test suites:
 * 1. AUDIT_ACTIONS catalog — regression guard for audit-string drift.
 * 2. recordAudit() — unit tests for actor resolution, IP extraction,
 *    failure swallowing, and no-request-context graceful handling.
 */

// vi.mock() calls are hoisted before imports by Vitest's transform.
// These mocks must be declared before any import that transitively pulls in
// the mocked modules (including the `import "server-only"` in audit.ts).

// server-only: build-time bundler guard only; not enforced at runtime in
// Node.js/vitest. Mock to prevent any version that does throw from breaking tests.
vi.mock("server-only", () => ({}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  auditEvents: {},
}));

vi.mock("@/lib/request-ip", () => ({
  getRequestIp: vi.fn(),
}));

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import { AUDIT_ACTIONS, recordAudit } from "./audit";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getRequestIp } from "@/lib/request-ip";

// ---------------------------------------------------------------------------
// AUDIT_ACTIONS catalog — regression for audit-string drift
//
// If any entry is renamed, added, or removed, this test fails before a stale
// audit_events row is written to the DB with a bad action string.
// ---------------------------------------------------------------------------

const EXPECTED_ENTRIES: Record<keyof typeof AUDIT_ACTIONS, string> = {
  FEATURE_FLAG_TOGGLED: "feature_flag.toggled",
  TOTP_ENROLLED: "totp.enrolled",
  TOTP_RECOVERY_CODES_REGENERATED: "totp.recovery_codes.regenerated",
  TOTP_RESET: "totp.reset",
  USER_ROLE_ASSIGNED: "user.role.assigned",
  USER_ROLE_REMOVED: "user.role.removed",
  USER_2FA_REQUIRED_CHANGED: "user.2fa_required.changed",
  USER_2FA_FORCE_RESET: "user.2fa_force_reset",
  // Account self-serve actions (added with /account page feature)
  USER_PROFILE_UPDATED: "user.profile_updated",
  USER_EMAIL_CHANGE_REQUESTED: "user.email_change_requested",
  USER_EMAIL_CHANGED: "user.email_changed",
  USER_EMAIL_CHANGE_CANCELLED: "user.email_change_cancelled",
  USER_PASSWORD_CHANGED: "user.password_changed",
  USER_DELETION_REQUESTED: "user.deletion_requested",
  // Password-reset flow (unauthenticated)
  USER_PASSWORD_RESET_REQUESTED: "user.password_reset_requested",
  USER_PASSWORD_RESET_COMPLETED: "user.password_reset_completed",
  // TOTP verification attempts (src/app/(auth)/totp/actions.ts)
  // kit-module:helpdesk-begin
  TICKET_FILED: "ticket.filed",
  // kit-module:helpdesk-end
  TOTP_VERIFY_FAILED: "totp.verify_failed",
  TOTP_VERIFY_SUCCEEDED: "totp.verify_succeeded",
  TOTP_RECOVERY_FAILED: "totp.recovery_failed",
  TOTP_RECOVERY_SUCCEEDED: "totp.recovery_succeeded",
  // Admin user management (deactivate / reactivate)
  USER_DEACTIVATED: "user.deactivated",
  USER_REACTIVATED: "user.reactivated",
  // Rate limiting — written from src/lib/rate-limit.ts, not from actions.ts
  RATE_LIMIT_BLOCKED: "rate_limit.blocked",
  // Email queue — written from src/lib/email/queue.ts, not from actions.ts
  EMAIL_QUEUE_PERMANENT_FAILURE: "email.queue.permanent_failure",
  // Access gate — written from src/app/access-pending/page.tsx during RSC render
  ACCESS_DENIED: "access.denied",
  // Account lockout — written from src/auth.ts authorize(), not from actions.ts
  USER_ACCOUNT_LOCKED: "user.account_locked",
  // Admin-initiated account unlock — written from src/app/(admin)/admin/users/actions.ts
  USER_ACCOUNT_UNLOCKED: "user.account_unlocked",
  // What's-new entries — written from src/app/(admin)/admin/whats-new/actions.ts
  // kit-module:whats-new-begin
  WHATS_NEW_ENTRY_CREATED: "whats_new.entry_created",
  WHATS_NEW_ENTRY_UPDATED: "whats_new.entry_updated",
  WHATS_NEW_ENTRY_DELETED: "whats_new.entry_deleted",
  // kit-module:whats-new-end
  // Device auth (module `mobile`, 2026-09-11-phase-4-mobile)
  // kit-module:device-auth-begin
  DEVICE_REGISTERED: "device.registered",
  DEVICE_REVOKED: "device.revoked",
  DEVICE_PAIRING_CODE_CREATED: "device.pairing_code_created",
  // kit-module:device-auth-end
};

const EXPECTED_COUNT = Object.keys(EXPECTED_ENTRIES).length;

describe("AUDIT_ACTIONS catalog — regression for audit-string drift", () => {
  it(`has exactly ${EXPECTED_COUNT} entries`, () => {
    const keys = Object.keys(AUDIT_ACTIONS);
    expect(keys).toHaveLength(EXPECTED_COUNT);
  });

  it("exports every expected key", () => {
    for (const key of Object.keys(EXPECTED_ENTRIES) as Array<
      keyof typeof AUDIT_ACTIONS
    >) {
      expect(AUDIT_ACTIONS).toHaveProperty(key);
    }
  });

  it("each key has the exact frozen string value", () => {
    for (const [key, value] of Object.entries(EXPECTED_ENTRIES) as Array<
      [keyof typeof AUDIT_ACTIONS, string]
    >) {
      expect(AUDIT_ACTIONS[key]).toBe(value);
    }
  });

  it(`has no extra keys beyond the ${EXPECTED_COUNT} expected entries`, () => {
    const expectedKeys = new Set(Object.keys(EXPECTED_ENTRIES));
    const actualKeys = Object.keys(AUDIT_ACTIONS);
    for (const key of actualKeys) {
      expect(expectedKeys.has(key)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// recordAudit() — unit tests
// ---------------------------------------------------------------------------

// Helper: build a mock Headers-like object with .get() support.
function makeHeaders(map: Record<string, string> = {}) {
  return {
    get: (name: string) => map[name.toLowerCase()] ?? null,
  };
}

describe("recordAudit() — actor resolution", () => {
  let valuesSpy: MockInstance;
  let consoleSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    // Stub headers() to return a minimal headers object (no ip/user-agent).
    vi.mocked(headers).mockResolvedValue(makeHeaders() as any);
    vi.mocked(getRequestIp).mockReturnValue(null);
    // Capture the values spy from the mock chain.
    valuesSpy = vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as any).mock.results[0]?.value
      ? (vi.mocked(db.insert).mock.results as any)
      : null;
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("actor omitted (undefined) → auth() is called and session values used", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", email: "a@example.com" },
    } as any);

    let capturedValues: Record<string, unknown> | null = null;
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        capturedValues = v;
        return Promise.resolve(undefined);
      }),
    } as any);

    await recordAudit({ action: AUDIT_ACTIONS.USER_PROFILE_UPDATED });

    expect(auth).toHaveBeenCalledOnce();
    expect(capturedValues).toMatchObject({
      actorUserId: "user-1",
      actorEmail: "a@example.com",
      action: "user.profile_updated",
    });
  });

  it("actor omitted, auth() returns null session → actorUserId and actorEmail are null", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    let capturedValues: Record<string, unknown> | null = null;
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        capturedValues = v;
        return Promise.resolve(undefined);
      }),
    } as any);

    await recordAudit({ action: AUDIT_ACTIONS.USER_PROFILE_UPDATED });

    expect(capturedValues).toMatchObject({
      actorUserId: null,
      actorEmail: null,
    });
  });

  it("actor explicit { userId, email } → auth() NOT called, provided values used", async () => {
    let capturedValues: Record<string, unknown> | null = null;
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        capturedValues = v;
        return Promise.resolve(undefined);
      }),
    } as any);

    await recordAudit({
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET_REQUESTED,
      actor: { userId: "u-explicit", email: "explicit@example.com" },
    });

    expect(auth).not.toHaveBeenCalled();
    expect(capturedValues).toMatchObject({
      actorUserId: "u-explicit",
      actorEmail: "explicit@example.com",
    });
  });

  it("actor null → auth() NOT called, actorUserId and actorEmail both null (system write)", async () => {
    let capturedValues: Record<string, unknown> | null = null;
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        capturedValues = v;
        return Promise.resolve(undefined);
      }),
    } as any);

    await recordAudit({
      action: AUDIT_ACTIONS.RATE_LIMIT_BLOCKED,
      actor: null,
    });

    expect(auth).not.toHaveBeenCalled();
    expect(capturedValues).toMatchObject({
      actorUserId: null,
      actorEmail: null,
    });
  });
});

describe("recordAudit() — ip and user-agent extraction", () => {
  let consoleSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(null as any);
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("headers() returns valid headers → ip and userAgent populated in insert", async () => {
    const fakeHeaders = makeHeaders({
      "user-agent": "Mozilla/5.0",
      "x-real-ip": "1.2.3.4",
    });
    vi.mocked(headers).mockResolvedValue(fakeHeaders as any);
    vi.mocked(getRequestIp).mockReturnValue("1.2.3.4");

    let capturedValues: Record<string, unknown> | null = null;
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        capturedValues = v;
        return Promise.resolve(undefined);
      }),
    } as any);

    await recordAudit({ action: AUDIT_ACTIONS.USER_PROFILE_UPDATED });

    expect(capturedValues).toMatchObject({
      ip: "1.2.3.4",
      userAgent: "Mozilla/5.0",
    });
  });

  it("headers() throws (no request context) → ip=null, userAgent=null, insert still called", async () => {
    vi.mocked(headers).mockRejectedValue(
      new Error("headers() called outside request context"),
    );

    let insertCalled = false;
    let capturedValues: Record<string, unknown> | null = null;
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        insertCalled = true;
        capturedValues = v;
        return Promise.resolve(undefined);
      }),
    } as any);

    await recordAudit({ action: AUDIT_ACTIONS.USER_PROFILE_UPDATED });

    expect(insertCalled).toBe(true);
    expect(capturedValues).toMatchObject({ ip: null, userAgent: null });
    // The outer console.error should NOT fire — only the inner catch fires,
    // and it is silent by design.
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});

describe("recordAudit() — failure swallowing", () => {
  let consoleSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(null as any);
    vi.mocked(headers).mockResolvedValue(makeHeaders() as any);
    vi.mocked(getRequestIp).mockReturnValue(null);
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("db.insert rejects → console.error called with [audit] prefix and function returns void (no throw)", async () => {
    const dbError = new Error("DB connection timeout");
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockRejectedValue(dbError),
    } as any);

    // Must not throw — audit failures must never take down the calling action.
    await expect(
      recordAudit({ action: AUDIT_ACTIONS.USER_PROFILE_UPDATED }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[audit] failed to write event",
      "user.profile_updated",
      dbError,
    );
  });

  it("auth() rejects → caught by outer handler; console.error called; no throw", async () => {
    vi.mocked(auth).mockRejectedValue(new Error("auth() crashed"));

    await expect(
      recordAudit({ action: AUDIT_ACTIONS.USER_PROFILE_UPDATED }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(consoleSpy.mock.calls[0][0]).toBe("[audit] failed to write event");
  });
});

describe("recordAudit() — metadata and optional fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(null as any);
    vi.mocked(headers).mockResolvedValue(makeHeaders() as any);
    vi.mocked(getRequestIp).mockReturnValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("metadata omitted → insert receives empty object {}", async () => {
    let capturedValues: Record<string, unknown> | null = null;
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        capturedValues = v;
        return Promise.resolve(undefined);
      }),
    } as any);

    await recordAudit({ action: AUDIT_ACTIONS.USER_PROFILE_UPDATED });

    expect(capturedValues).toMatchObject({ metadata: {} });
  });

  it("metadata provided → insert receives it verbatim", async () => {
    let capturedValues: Record<string, unknown> | null = null;
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        capturedValues = v;
        return Promise.resolve(undefined);
      }),
    } as any);

    await recordAudit({
      action: AUDIT_ACTIONS.USER_ROLE_ASSIGNED,
      metadata: { roleId: "role-abc", reason: "onboarding" },
    });

    expect(capturedValues).toMatchObject({
      metadata: { roleId: "role-abc", reason: "onboarding" },
    });
  });

  it("resourceType and resourceId omitted → null in insert", async () => {
    let capturedValues: Record<string, unknown> | null = null;
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
        capturedValues = v;
        return Promise.resolve(undefined);
      }),
    } as any);

    await recordAudit({ action: AUDIT_ACTIONS.USER_PROFILE_UPDATED });

    expect(capturedValues).toMatchObject({
      resourceType: null,
      resourceId: null,
    });
  });
});
