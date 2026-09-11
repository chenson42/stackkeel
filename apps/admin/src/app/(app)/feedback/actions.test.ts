/**
 * Unit tests for updateFeedbackStatus (Increment 6, step 6a —
 * apps/portal/docs/work-log/2026-09-06-feedback-admin-triage.md).
 *
 * Covers:
 *   1. No session -> { ok: false, error: "Not signed in." }, validateFeedbackTransition
 *      never called (short-circuit is real).
 *   2. Session without admin.feedback feature -> { ok: false, error: "Forbidden." },
 *      validateFeedbackTransition never called.
 *   3. Authorized call: validateFeedbackTransition resolves { ok: true } -> db.update
 *      IS called, returns { ok: true }.
 *   4. Sabotage test: validateFeedbackTransition resolves { ok: false, error } ->
 *      db.update is NEVER reached, that error is returned verbatim.
 *
 * Mocking shape mirrors ../users/[id]/actions.test.ts's own established
 * convention for this app: server-only, @/lib/db/schema, and drizzle-orm are
 * all stubbed rather than letting the real modules load — these tests assert
 * control flow and outcomes, not generated SQL.
 *
 * vi.mock() calls are hoisted before imports by Vitest's transform.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => auth() }));

const mockHasFeature = vi.fn();
vi.mock("@repo/permissions", () => ({
  FEATURES: { ADMIN_FEEDBACK: "admin.feedback" },
  hasFeature: (features: string[] | undefined, key: string) =>
    mockHasFeature(features, key),
}));

const mockValidateFeedbackTransition = vi.fn();
vi.mock("@repo/db", () => ({
  validateFeedbackTransition: (...a: unknown[]) =>
    mockValidateFeedbackTransition(...a),
}));

vi.mock("@/lib/db/schema", () => ({
  feedback: { id: "feedback.id", status: "feedback.status" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => [a, b],
}));

const dbUpdateSpy = vi.fn();
const dbSetSpy = vi.fn();
const dbWhereSpy = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    update: (...a: unknown[]) => {
      dbUpdateSpy(...a);
      return { set: (...b: unknown[]) => (dbSetSpy(...b), { where: (...c: unknown[]) => dbWhereSpy(...c) }) };
    },
  },
}));

const { updateFeedbackStatus } = await import("./actions");

const sessionWithFeature = {
  user: {
    id: "admin-user-id",
    email: "admin@example.com",
    features: ["admin.feedback"],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  dbWhereSpy.mockResolvedValue(undefined);
});

describe("updateFeedbackStatus — auth guard", () => {
  it("returns { ok: false, error: 'Not signed in.' } when there is no session, and never calls validateFeedbackTransition", async () => {
    auth.mockResolvedValue(null);

    const result = await updateFeedbackStatus("feedback-1", "triaged");

    expect(result).toEqual({ ok: false, error: "Not signed in." });
    expect(mockValidateFeedbackTransition).not.toHaveBeenCalled();
    expect(dbUpdateSpy).not.toHaveBeenCalled();
  });
});

describe("updateFeedbackStatus — feature gate", () => {
  it("returns { ok: false, error: 'Forbidden.' } when the session lacks admin.feedback, and never calls validateFeedbackTransition", async () => {
    auth.mockResolvedValue(sessionWithFeature);
    mockHasFeature.mockReturnValue(false);

    const result = await updateFeedbackStatus("feedback-1", "triaged");

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(mockValidateFeedbackTransition).not.toHaveBeenCalled();
    expect(dbUpdateSpy).not.toHaveBeenCalled();
  });
});

describe("updateFeedbackStatus — authorized transition", () => {
  it("calls db.update only after validateFeedbackTransition resolves { ok: true }, and returns { ok: true }", async () => {
    auth.mockResolvedValue(sessionWithFeature);
    mockHasFeature.mockReturnValue(true);
    mockValidateFeedbackTransition.mockResolvedValue({ ok: true });

    const result = await updateFeedbackStatus("feedback-1", "triaged");

    expect(mockValidateFeedbackTransition).toHaveBeenCalledWith(
      expect.anything(),
      "feedback-1",
      "triaged",
    );
    expect(dbUpdateSpy).toHaveBeenCalledTimes(1);
    expect(dbSetSpy).toHaveBeenCalledWith({ status: "triaged" });
    expect(result).toEqual({ ok: true });
  });
});

describe("updateFeedbackStatus — illegal transition (sabotage test)", () => {
  it("returns validateFeedbackTransition's own typed error and NEVER calls db.update when the transition is rejected", async () => {
    auth.mockResolvedValue(sessionWithFeature);
    mockHasFeature.mockReturnValue(true);
    mockValidateFeedbackTransition.mockResolvedValue({
      ok: false,
      error: "Cannot change status from 'done' to 'triaged'.",
    });

    const result = await updateFeedbackStatus("feedback-1", "triaged");

    expect(result).toEqual({
      ok: false,
      error: "Cannot change status from 'done' to 'triaged'.",
    });
    expect(dbUpdateSpy).not.toHaveBeenCalled();
  });
});
