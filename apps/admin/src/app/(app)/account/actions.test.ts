// vi.mock() calls are hoisted before imports by Vitest's transform.
// All mocks must be declared before any import statements.

// ---------------------------------------------------------------------------
// auth() mock
// ---------------------------------------------------------------------------
const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: mockAuth }));

// ---------------------------------------------------------------------------
// checkRateLimit mock (default: allowed) — this file also exercises
// changePassword indirectly via the shared mock, but only submitFeedback is
// under test here.
// ---------------------------------------------------------------------------
const mockCheckRateLimit = vi.hoisted(() => vi.fn().mockResolvedValue({ allowed: true }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mockCheckRateLimit }));

// ---------------------------------------------------------------------------
// recordAudit / AUDIT_ACTIONS mock — submitFeedback never calls recordAudit
// (audit-exempt, matching Portal's precedent); this mock exists only so
// importing the module (which also defines changePassword, which DOES call
// recordAudit) doesn't fail.
// ---------------------------------------------------------------------------
const mockRecordAudit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/audit", () => ({
  AUDIT_ACTIONS: { ADMIN_PASSWORD_CHANGED: "admin.password.changed" },
  recordAudit: mockRecordAudit,
}));

vi.mock("@/lib/request-ip", () => ({ getRequestIp: () => "127.0.0.1" }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("bcryptjs", () => ({ compare: vi.fn(), hash: vi.fn() }));

// ---------------------------------------------------------------------------
// Drizzle db mock — chainable insert only (submitFeedback never updates/selects)
// ---------------------------------------------------------------------------
const mockReturning = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: "new-feedback-row-id" }]),
);
const mockInsertValues = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockReturning }),
);
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockInsertValues }));
const mockFindFirst = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    insert: mockInsert,
    query: { users: { findFirst: mockFindFirst } },
  },
}));

// ---------------------------------------------------------------------------
// Schema mock — minimal column stub, matching real column names
// ---------------------------------------------------------------------------
vi.mock("@/lib/db/schema", () => ({
  users: { id: { name: "id" }, password: { name: "password" }, email: { name: "email" } },
  feedback: {
    id: { name: "id" },
    userId: { name: "user_id" },
    app: { name: "app" },
    category: { name: "category" },
    body: { name: "body" },
    contextPath: { name: "context_path" },
    appVersion: { name: "app_version" },
    status: { name: "status" },
  },
}));

// ---------------------------------------------------------------------------
// isFlagEnabled mock (default: ON — most getMyFeedback tests want the flag
// out of the way; the flag-off short-circuit gets its own describe block
// that overrides this per-test)
// ---------------------------------------------------------------------------
const mockIsFlagEnabled = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/lib/flags", () => ({ isFlagEnabled: mockIsFlagEnabled }));

// ---------------------------------------------------------------------------
// getFeedbackByUserId mock (@repo/db) — getMyFeedback's ONLY call into the
// shared primitive. Mocked here (rather than exercised against a real DB)
// because packages/db/src/feedback.test.ts already proves the primitive
// itself is IDOR-safe against real Postgres; what THIS file must prove is
// that the wrapper calls it with the right argument and nothing else.
// ---------------------------------------------------------------------------
const mockGetFeedbackByUserId = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@repo/db", () => ({ getFeedbackByUserId: mockGetFeedbackByUserId }));

// ---------------------------------------------------------------------------
// Import module under test (after all vi.mock() declarations)
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitFeedback, getMyFeedback } from "./actions";

const SESSION_MEMBER = {
  user: {
    id: "user-admin-123",
    email: "member@the ancestor site",
    name: "Test Member",
  },
};

function input(overrides: Partial<Parameters<typeof submitFeedback>[0]> = {}) {
  return {
    body: "Some feedback",
    category: null,
    contextPath: null,
    appVersion: null,
    tzOffsetMinutes: null,
    ...overrides,
  };
}

describe("submitFeedback (Admin) — authentication gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("returns error when session is null", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const result = await submitFeedback(input());
    expect(result).toEqual({ ok: false, error: "Not signed in." });
  });

  it("returns error when session.user.id is missing", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: undefined } });
    const result = await submitFeedback(input());
    expect(result).toEqual({ ok: false, error: "Not signed in." });
  });

  it("does not touch the rate limiter or the database when not signed in", async () => {
    mockAuth.mockResolvedValueOnce(null);
    await submitFeedback(input());
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("submitFeedback (Admin) — rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION_MEMBER);
  });

  it("returns rate-limit error when checkRateLimit returns allowed=false", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 600 });
    const result = await submitFeedback(input());
    expect(result).toEqual({
      ok: false,
      error: "Too many submissions — come back in a bit.",
    });
  });

  it("keys the rate limiter by the signed-in user's id", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: true });
    await submitFeedback(input());
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "feedback:user-admin-123",
      { max: 5, windowSeconds: 3600 },
      expect.objectContaining({ userId: "user-admin-123", reason: "feedback_submission" }),
    );
  });

  it("does not insert when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 });
    await submitFeedback(input());
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("submitFeedback (Admin) — body validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION_MEMBER);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("rejects empty body (whitespace only)", async () => {
    const result = await submitFeedback(input({ body: "   " }));
    expect(result).toEqual({ ok: false, error: "Say something first." });
  });

  it("rejects empty string body", async () => {
    const result = await submitFeedback(input({ body: "" }));
    expect(result).toEqual({ ok: false, error: "Say something first." });
  });

  it("rejects body over 2000 chars (after trim)", async () => {
    const result = await submitFeedback(input({ body: "x".repeat(2001) }));
    expect(result).toEqual({
      ok: false,
      error: "Feedback must be 2,000 characters or fewer.",
    });
  });

  it("accepts body of exactly 2000 chars", async () => {
    const result = await submitFeedback(input({ body: "x".repeat(2000) }));
    expect(result.ok).toBe(true);
  });
});

describe("submitFeedback (Admin) — category validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION_MEMBER);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("rejects invalid category string", async () => {
    const result = await submitFeedback(input({ category: "invalid-category" }));
    expect(result).toEqual({ ok: false, error: "Invalid category." });
  });

  it("accepts null category (no selection)", async () => {
    const result = await submitFeedback(input({ category: null }));
    expect(result.ok).toBe(true);
  });

  it.each(["suggestion", "bug", "other"])("accepts valid category %s", async (category) => {
    const result = await submitFeedback(
      input({ category, contextPath: category === "bug" ? "/users" : null }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("submitFeedback (Admin) — bug-only metadata handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION_MEMBER);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("includes contextPath in insert when category=bug", async () => {
    await submitFeedback(
      input({ category: "bug", contextPath: "/requests", appVersion: "1.0.0" }),
    );
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.contextPath).toBe("/requests");
  });

  it("truncates contextPath to 512 chars when category=bug", async () => {
    await submitFeedback(input({ category: "bug", contextPath: "a".repeat(600) }));
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.contextPath).toHaveLength(512);
  });

  it("strips contextPath to null when category is not bug", async () => {
    await submitFeedback(input({ category: "suggestion", contextPath: "/some/path" }));
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.contextPath).toBeNull();
  });

  it("strips appVersion to null when category is not bug", async () => {
    await submitFeedback(input({ category: "other", appVersion: "1.0.0" }));
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.appVersion).toBeNull();
  });

  it("truncates appVersion to 32 chars when category=bug", async () => {
    await submitFeedback(
      input({ category: "bug", contextPath: "/users", appVersion: "x".repeat(50) }),
    );
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.appVersion).toHaveLength(32);
  });

  it("submits appVersion as null when the caller never passed one (no src/lib/version.ts in Admin)", async () => {
    await submitFeedback(input({ category: "bug", contextPath: "/users", appVersion: null }));
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.appVersion).toBeNull();
  });
});

describe("submitFeedback (Admin) — app scoping — regression for a missing/wrong app value on insert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION_MEMBER);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("includes app: 'admin' in the feedback insert", async () => {
    await submitFeedback(input());
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.app).toBe("admin");
  });

  it("includes the signed-in user's id as userId, not a client-supplied value", async () => {
    await submitFeedback(input());
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.userId).toBe("user-admin-123");
  });
});

describe("submitFeedback (Admin) — success shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION_MEMBER);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("returns the inserted row id on success", async () => {
    mockReturning.mockResolvedValueOnce([{ id: "row-xyz" }]);
    const result = await submitFeedback(input());
    expect(result).toEqual({ ok: true, data: { id: "row-xyz" } });
  });

  it("never calls recordAudit for a feedback submission (audit-exempt, matching Portal's precedent)", async () => {
    await submitFeedback(input());
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// getMyFeedback — Increment 5 (feedback.status_view)
// -----------------------------------------------------------------------

describe("getMyFeedback (Admin) — zero-argument shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFlagEnabled.mockResolvedValue(true);
    mockAuth.mockResolvedValue(SESSION_MEMBER);
    mockGetFeedbackByUserId.mockResolvedValue([]);
  });

  it("is genuinely zero-argument — TypeScript already enforces this at compile time; this is the runtime companion check", () => {
    expect(getMyFeedback.length).toBe(0);
  });

  it("calls getFeedbackByUserId with exactly session.user.id, sourced from nowhere else", async () => {
    await getMyFeedback();
    expect(mockGetFeedbackByUserId).toHaveBeenCalledTimes(1);
    expect(mockGetFeedbackByUserId).toHaveBeenCalledWith(
      expect.anything(),
      "user-admin-123",
    );
  });

  it("maps rows to MyFeedbackItem shape, including createdAt as an ISO string", async () => {
    const createdAt = new Date("2026-09-01T12:00:00.000Z");
    mockGetFeedbackByUserId.mockResolvedValueOnce([
      {
        id: "row-1",
        app: "admin",
        category: null,
        body: "Works great",
        status: "triaged",
        createdAt,
      },
    ]);
    const result = await getMyFeedback();
    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: "row-1",
          app: "admin",
          category: null,
          body: "Works great",
          status: "triaged",
          createdAt: createdAt.toISOString(),
        },
      ],
    });
  });
});

describe("getMyFeedback (Admin) — flag gate short-circuit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION_MEMBER);
    mockGetFeedbackByUserId.mockResolvedValue([]);
  });

  it("returns ok:false without calling auth() or getFeedbackByUserId when the flag is off", async () => {
    mockIsFlagEnabled.mockResolvedValueOnce(false);
    const result = await getMyFeedback();
    expect(result).toEqual({ ok: false, error: "This isn't available yet." });
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockGetFeedbackByUserId).not.toHaveBeenCalled();
  });
});

describe("getMyFeedback (Admin) — authentication gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFlagEnabled.mockResolvedValue(true);
    mockGetFeedbackByUserId.mockResolvedValue([]);
  });

  it("returns error when session is null, without calling getFeedbackByUserId", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const result = await getMyFeedback();
    expect(result).toEqual({ ok: false, error: "Not signed in." });
    expect(mockGetFeedbackByUserId).not.toHaveBeenCalled();
  });

  it("returns error when session.user is null", async () => {
    mockAuth.mockResolvedValueOnce({ user: null });
    const result = await getMyFeedback();
    expect(result).toEqual({ ok: false, error: "Not signed in." });
    expect(mockGetFeedbackByUserId).not.toHaveBeenCalled();
  });
});
