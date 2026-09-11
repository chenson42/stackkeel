// vi.mock() calls are hoisted before imports by Vitest's transform.
// All mocks must be declared before any import statements.

vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// auth() mock
// ---------------------------------------------------------------------------
const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: mockAuth }));

// ---------------------------------------------------------------------------
// checkRateLimit mock (default: allowed)
// ---------------------------------------------------------------------------
const mockCheckRateLimit = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ allowed: true }),
);
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mockCheckRateLimit }));

// ---------------------------------------------------------------------------
// enqueueEmail mock
// ---------------------------------------------------------------------------
const mockEnqueueEmail = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: "queued-email-id", sentInline: false }),
);
vi.mock("@/lib/email", () => ({ enqueueEmail: mockEnqueueEmail }));

// escapeHtml: passthrough in tests (XSS correctness is tested separately in escape-html.test.ts)
vi.mock("@/lib/email/escape-html", () => ({
  escapeHtml: (s: string) => s,
}));

// ---------------------------------------------------------------------------
// Drizzle db mock — chainable insert, update, select, query
// ---------------------------------------------------------------------------

// Insert chain:
//   db.insert(t).values({}) → { returning: fn, onConflictDoUpdate: fn }
const mockOnConflictDoUpdate = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);
const mockReturning = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: "new-feedback-row-id" }]),
);
const mockInsertValues = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    returning: mockReturning,
    onConflictDoUpdate: mockOnConflictDoUpdate,
  }),
);
const mockInsert = vi.hoisted(() =>
  vi.fn().mockReturnValue({ values: mockInsertValues }),
);

// Select chain (used for admin notification recipient query):
//   db.select({}).from(t).innerJoin().innerJoin().where() → Promise<[]>
const mockSelectWhere = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockSelectInnerJoin2 = vi.hoisted(() =>
  vi.fn().mockReturnValue({ where: mockSelectWhere }),
);
const mockSelectInnerJoin1 = vi.hoisted(() =>
  vi.fn().mockReturnValue({ innerJoin: mockSelectInnerJoin2 }),
);
const mockSelectFrom = vi.hoisted(() =>
  vi.fn().mockReturnValue({ innerJoin: mockSelectInnerJoin1 }),
);
const mockSelect = vi.hoisted(() =>
  vi.fn().mockReturnValue({ from: mockSelectFrom }),
);

vi.mock("@/lib/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
  },
}));

// ---------------------------------------------------------------------------
// Schema mock — minimal column stubs for Drizzle table references
// ---------------------------------------------------------------------------
vi.mock("@/lib/db/schema", () => ({
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
  feedbackPromptState: {
    userId: { name: "user_id" },
    optedOut: { name: "opted_out" },
    lastSnoozedDate: { name: "last_snoozed_date" },
    lastSubmittedDate: { name: "last_submitted_date" },
  },
  users: {
    email: { name: "email" },
    name: { name: "name" },
    id: { name: "id" },
  },
  userRoles: {
    userId: { name: "user_id" },
    roleId: { name: "role_id" },
  },
  roles: {
    id: { name: "id" },
    name: { name: "name" },
  },
}));

// ---------------------------------------------------------------------------
// Permissions mock — ADMIN_ROLE only. Real code in this file (actions.ts)
// imports ADMIN_ROLE to filter the admin-notification recipient query.
// FEATURES/hasFeature were only needed to test updateFeedbackStatus, which
// lived in the now-deleted apps/portal/src/app/(admin)/admin/feedback/
// (Increment 6, step 6b, 2026-09-06) — removed with it.
// ---------------------------------------------------------------------------
vi.mock("@/lib/permissions", () => ({
  ADMIN_ROLE: "admin",
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
// shared primitive. Mocked directly here rather than exercised through the
// (argument-blind, sentinel-eq) Drizzle mock above deliberately: QA found
// that mock ignores its arguments, which is exactly the defect that would
// let an IDOR bug pass this file's tests. packages/db/src/feedback.test.ts
// already proves the primitive itself is IDOR-safe against real Postgres;
// what THIS file must prove is that the wrapper calls it with the right
// argument and nothing else.
// ---------------------------------------------------------------------------
const mockGetFeedbackByUserId = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@repo/db", () => ({ getFeedbackByUserId: mockGetFeedbackByUserId }));

// ---------------------------------------------------------------------------
// Import modules under test (after all vi.mock() declarations)
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from "vitest";
// computeLocalDate is in date-utils.ts (extracted from actions.ts because Next.js 16
// Turbopack requires all "use server" exports to be async Server Actions).
import { computeLocalDate } from "./date-utils";
import {
  submitFeedback,
  snoozeFeedbackPrompt,
  setFeedbackOptOut,
  getMyFeedback,
} from "./actions";
// updateFeedbackStatus (admin triage) used to be imported and tested from
// here too. It lived in apps/portal/src/app/(admin)/admin/feedback/actions.ts,
// deleted 2026-09-06 (Increment 6, step 6b) — triage moved to the platform
// Admin's own /feedback page. See packages/db/src/feedback.test.ts and
// apps/admin/src/app/(app)/feedback/actions.test.ts for its replacement
// coverage.

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SESSION_MEMBER = {
  user: {
    id: "user-member-123",
    email: "member@example.com",
    name: "Test Member",
  },
};

// ---------------------------------------------------------------------------
// computeLocalDate — pure function, no mocks needed
// ---------------------------------------------------------------------------

describe("computeLocalDate — TZ offset to YYYY-MM-DD (DECISION-023)", () => {
  it("offset=0 returns UTC date", () => {
    const result = computeLocalDate(0);
    const expected = new Date().toISOString().slice(0, 10);
    expect(result).toBe(expected);
  });

  it("null falls back to UTC (same as offset=0)", () => {
    // Both should produce the same string within the same tick.
    expect(computeLocalDate(null)).toBe(computeLocalDate(0));
  });

  it("undefined falls back to UTC (same as offset=0)", () => {
    expect(computeLocalDate(undefined)).toBe(computeLocalDate(0));
  });

  it("offset=9999 is clamped to 840 (UTC+14 maximum)", () => {
    // After clamping, result equals computeLocalDate(840)
    expect(computeLocalDate(9999)).toBe(computeLocalDate(840));
  });

  it("offset=-9999 is clamped to -720 (UTC-12 minimum)", () => {
    expect(computeLocalDate(-9999)).toBe(computeLocalDate(-720));
  });

  it("offset=300 (UTC-5) produces a date 5 hours behind UTC", () => {
    // The returned date should be at most 1 day behind the UTC date.
    const utcDate = computeLocalDate(0);
    const localDate = computeLocalDate(300);
    // Both must be a valid YYYY-MM-DD string
    expect(localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // localDate cannot be in the future relative to UTC
    expect(localDate <= utcDate).toBe(true);
  });

  it("returns a string in YYYY-MM-DD format", () => {
    expect(computeLocalDate(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(computeLocalDate(300)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(computeLocalDate(-540)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// submitFeedback — input validation
// ---------------------------------------------------------------------------

describe("submitFeedback — authentication gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("returns error when session is null", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const result = await submitFeedback({
      body: "A suggestion",
      category: null,
      contextPath: null,
      appVersion: null,
      tzOffsetMinutes: null,
    });
    expect(result).toEqual({ ok: false, error: "Not signed in." });
  });

  it("returns error when session.user is null", async () => {
    mockAuth.mockResolvedValueOnce({ user: null });
    const result = await submitFeedback({
      body: "A suggestion",
      category: null,
      contextPath: null,
      appVersion: null,
      tzOffsetMinutes: null,
    });
    expect(result).toEqual({ ok: false, error: "Not signed in." });
  });
});

describe("submitFeedback — rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns rate-limit error when checkRateLimit returns allowed=false", async () => {
    mockAuth.mockResolvedValueOnce(SESSION_MEMBER);
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 600,
    });
    const result = await submitFeedback({
      body: "A suggestion",
      category: null,
      contextPath: null,
      appVersion: null,
      tzOffsetMinutes: null,
    });
    expect(result).toEqual({
      ok: false,
      error: "Too many submissions — come back in a bit.",
    });
  });
});

describe("submitFeedback — body validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION_MEMBER);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("rejects empty body (whitespace only)", async () => {
    const result = await submitFeedback({
      body: "   ",
      category: null,
      contextPath: null,
      appVersion: null,
      tzOffsetMinutes: null,
    });
    expect(result).toEqual({ ok: false, error: "Say something first." });
  });

  it("rejects empty string body", async () => {
    const result = await submitFeedback({
      body: "",
      category: null,
      contextPath: null,
      appVersion: null,
      tzOffsetMinutes: null,
    });
    expect(result).toEqual({ ok: false, error: "Say something first." });
  });

  it("rejects body over 2000 chars (after trim)", async () => {
    const result = await submitFeedback({
      body: "x".repeat(2001),
      category: null,
      contextPath: null,
      appVersion: null,
      tzOffsetMinutes: null,
    });
    expect(result).toEqual({
      ok: false,
      error: "Feedback must be 2,000 characters or fewer.",
    });
  });

  it("accepts body of exactly 2000 chars", async () => {
    const result = await submitFeedback({
      body: "x".repeat(2000),
      category: null,
      contextPath: null,
      appVersion: null,
      tzOffsetMinutes: null,
    });
    expect(result.ok).toBe(true);
  });
});

describe("submitFeedback — category validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION_MEMBER);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("rejects invalid category string", async () => {
    const result = await submitFeedback({
      body: "Some feedback",
      category: "invalid-category",
      contextPath: null,
      appVersion: null,
      tzOffsetMinutes: null,
    });
    expect(result).toEqual({ ok: false, error: "Invalid category." });
  });

  it("accepts null category (no selection)", async () => {
    const result = await submitFeedback({
      body: "Some feedback",
      category: null,
      contextPath: null,
      appVersion: null,
      tzOffsetMinutes: null,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts valid category "suggestion"', async () => {
    const result = await submitFeedback({
      body: "My suggestion",
      category: "suggestion",
      contextPath: null,
      appVersion: null,
      tzOffsetMinutes: null,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts valid category "bug"', async () => {
    const result = await submitFeedback({
      body: "Bug report",
      category: "bug",
      contextPath: "/home",
      appVersion: "0.5.2",
      tzOffsetMinutes: null,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts valid category "other"', async () => {
    const result = await submitFeedback({
      body: "General feedback",
      category: "other",
      contextPath: null,
      appVersion: null,
      tzOffsetMinutes: null,
    });
    expect(result.ok).toBe(true);
  });
});

describe("submitFeedback — bug-only metadata handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION_MEMBER);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("includes contextPath in insert when category=bug", async () => {
    await submitFeedback({
      body: "Bug report",
      category: "bug",
      contextPath: "/home/dashboard",
      appVersion: "0.5.2",
      tzOffsetMinutes: null,
    });
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.contextPath).toBe("/home/dashboard");
  });

  it("truncates contextPath to 512 chars when category=bug", async () => {
    await submitFeedback({
      body: "Bug report",
      category: "bug",
      contextPath: "a".repeat(600),
      appVersion: "0.5.2",
      tzOffsetMinutes: null,
    });
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.contextPath).toHaveLength(512);
  });

  it("strips contextPath to null when category=suggestion", async () => {
    await submitFeedback({
      body: "A suggestion",
      category: "suggestion",
      contextPath: "/some/path",
      appVersion: "0.5.2",
      tzOffsetMinutes: null,
    });
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.contextPath).toBeNull();
  });

  it("strips appVersion to null when category=other", async () => {
    await submitFeedback({
      body: "General feedback",
      category: "other",
      contextPath: null,
      appVersion: "0.5.2",
      tzOffsetMinutes: null,
    });
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.appVersion).toBeNull();
  });

  it("truncates appVersion to 32 chars when category=bug", async () => {
    await submitFeedback({
      body: "Bug report",
      category: "bug",
      contextPath: "/home",
      appVersion: "x".repeat(50),
      tzOffsetMinutes: null,
    });
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.appVersion).toHaveLength(32);
  });
});

// ---------------------------------------------------------------------------
// submitFeedback — app scoping (feedback is now a shared cross-app table,
// 2026-09-06). The schema mock above previously had no `app` field at all,
// and no assertion here checked it — a call site that silently dropped
// `app: "portal"` from the insert would have passed every test in this file
// unnoticed. That is exactly the "self-agreeing mock" gap root CLAUDE.md's
// QA rule warns about: the mock and the implementation could drift together
// and nothing here would catch it.
//
// This section used to also cover updateFeedbackStatus's own app-scoping
// (its lookup/update predicates) and its full state-machine transition
// suite — both removed 2026-09-06 (Increment 6, step 6b) along with the
// admin action file they tested. Replacement coverage:
// packages/db/src/feedback.test.ts's validateFeedbackTransition suite (the
// transition table itself, now shared) and
// apps/admin/src/app/(app)/feedback/actions.test.ts (the platform Admin's own
// updateFeedbackStatus — auth, feature gate, sabotage test).
// ---------------------------------------------------------------------------

describe("submitFeedback — app scoping — regression for a missing app column on insert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION_MEMBER);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("includes app: 'portal' in the feedback insert", async () => {
    await submitFeedback({
      body: "Some feedback",
      category: null,
      contextPath: null,
      appVersion: null,
      tzOffsetMinutes: null,
    });
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.app).toBe("portal");
  });
});

// ---------------------------------------------------------------------------
// Clobber-prevention — each upsert sets ONLY its own field
// ---------------------------------------------------------------------------

describe("clobber-prevention — onConflictDoUpdate sets only one field per action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION_MEMBER);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("snoozeFeedbackPrompt: onConflictDoUpdate.set has ONLY lastSnoozedDate", async () => {
    await snoozeFeedbackPrompt(0);
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
    const callArg = mockOnConflictDoUpdate.mock.calls[0][0];
    expect(Object.keys(callArg.set)).toEqual(["lastSnoozedDate"]);
  });

  it("setFeedbackOptOut: onConflictDoUpdate.set has ONLY optedOut", async () => {
    await setFeedbackOptOut(true);
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
    const callArg = mockOnConflictDoUpdate.mock.calls[0][0];
    expect(Object.keys(callArg.set)).toEqual(["optedOut"]);
  });

  it("setFeedbackOptOut(false): onConflictDoUpdate.set has ONLY optedOut", async () => {
    await setFeedbackOptOut(false);
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
    const callArg = mockOnConflictDoUpdate.mock.calls[0][0];
    expect(Object.keys(callArg.set)).toEqual(["optedOut"]);
  });

  it("submitFeedback: feedbackPromptState upsert sets ONLY lastSubmittedDate", async () => {
    // submitFeedback calls db.insert twice:
    //   1. feedback table → uses .returning() (not onConflictDoUpdate)
    //   2. feedbackPromptState table → uses .onConflictDoUpdate()
    await submitFeedback({
      body: "A suggestion",
      category: null,
      contextPath: null,
      appVersion: null,
      tzOffsetMinutes: null,
    });
    // onConflictDoUpdate is called once — for the feedbackPromptState upsert.
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
    const callArg = mockOnConflictDoUpdate.mock.calls[0][0];
    expect(Object.keys(callArg.set)).toEqual(["lastSubmittedDate"]);
  });
});

// escapeHtml is tested in src/lib/email/escape-html.test.ts (dedicated file
// with no module-level mock, so the real implementation is exercised).

// -----------------------------------------------------------------------
// getMyFeedback — Increment 5 (feedback.status_view)
// -----------------------------------------------------------------------

describe("getMyFeedback (Portal) — zero-argument shape", () => {
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
      "user-member-123",
    );
  });

  it("maps rows to MyFeedbackItem shape, including createdAt as an ISO string", async () => {
    const createdAt = new Date("2026-09-01T12:00:00.000Z");
    mockGetFeedbackByUserId.mockResolvedValueOnce([
      {
        id: "row-1",
        app: "portal",
        category: "suggestion",
        body: "More dark mode please",
        status: "done",
        createdAt,
      },
    ]);
    const result = await getMyFeedback();
    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: "row-1",
          app: "portal",
          category: "suggestion",
          body: "More dark mode please",
          status: "done",
          createdAt: createdAt.toISOString(),
        },
      ],
    });
  });
});

describe("getMyFeedback (Portal) — flag gate short-circuit", () => {
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

describe("getMyFeedback (Portal) — authentication gate", () => {
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
