/**
 * Unit tests for the operator ticket actions — control flow and outcomes,
 * not generated SQL (mocking shape mirrors ../feedback/actions.test.ts).
 *
 * Covers the authorization short-circuits, the transition-sabotage path
 * (validateTicketTransition says no → no db write), vocabulary rejection,
 * the resolution-notification trigger, and promotion's double-promotion
 * guard.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => auth() }));

const mockHasFeature = vi.fn();
vi.mock("@repo/permissions", () => ({
  FEATURES: { ADMIN_TICKETS: "admin.tickets" },
  hasFeature: (features: string[] | undefined, key: string) =>
    mockHasFeature(features, key),
}));

const mockValidateTransition = vi.fn();
const mockValidatePromotion = vi.fn();
vi.mock("@repo/db", () => ({
  validateTicketTransition: (...a: unknown[]) => mockValidateTransition(...a),
  validateTicketReply: (body: string) =>
    body.trim().length > 0
      ? { kind: "ok" }
      : { kind: "invalid_input", errors: ["Message must be 1-5000 characters."] },
  validateFeedbackPromotion: (...a: unknown[]) => mockValidatePromotion(...a),
  CHANGE_CLASSES: ["content", "config", "theme", "bug", "feature"],
  TICKET_AREAS: ["account", "billing", "content", "website", "other"],
  TICKET_PRIORITIES: ["low", "normal", "high", "urgent"],
}));

vi.mock("@/lib/db/schema", () => ({
  tickets: { id: "tickets.id" },
  ticketMessages: {},
  ticketActions: {},
  feedback: { id: "feedback.id" },
  users: { id: "users.id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => [a, b],
}));

const recordAuditSpy = vi.fn();
vi.mock("@/lib/audit", () => ({
  recordAudit: (...a: unknown[]) => recordAuditSpy(...a),
  AUDIT_ACTIONS: {
    TICKET_STATUS_CHANGED: "ticket.status_changed",
    TICKET_ASSIGNED: "ticket.assigned",
    TICKET_RECLASSIFIED: "ticket.reclassified",
    TICKET_AREA_CHANGED: "ticket.area_changed",
    TICKET_PRIORITY_CHANGED: "ticket.priority_changed",
    FEEDBACK_PROMOTED_TO_TICKET: "feedback.promoted_to_ticket",
  },
}));

const notifyResolutionSpy = vi.fn();
const notifyReplySpy = vi.fn();
const notifyPromotionSpy = vi.fn();
vi.mock("@/lib/tickets-notifications", () => ({
  notifySubmitterOfOperatorReply: (...a: unknown[]) => notifyReplySpy(...a),
  notifySubmitterOfResolution: (...a: unknown[]) => notifyResolutionSpy(...a),
  notifySubmitterOfPromotion: (...a: unknown[]) => notifyPromotionSpy(...a),
}));

const ticketsFindFirst = vi.fn();
const usersFindFirst = vi.fn();
const dbUpdateSpy = vi.fn();
const dbInsertSpy = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      tickets: { findFirst: (...a: unknown[]) => ticketsFindFirst(...a) },
      users: { findFirst: (...a: unknown[]) => usersFindFirst(...a) },
    },
    update: (...a: unknown[]) => {
      dbUpdateSpy(...a);
      return { set: () => ({ where: async () => undefined }) };
    },
    insert: (...a: unknown[]) => {
      dbInsertSpy(...a);
      return {
        values: (v: unknown) => ({
          returning: async () => [{ id: "t-new" }],
          // insert().values() awaited directly resolves too:
          then: (resolve: (x: unknown) => void) => resolve(v),
        }),
      };
    },
  },
}));

import {
  setTicketStatusAction,
  setTicketPriorityAction,
  replyToTicketAsOperatorAction,
  promoteFeedbackToTicketAction,
} from "./actions";

const OPERATOR_SESSION = {
  user: { id: "op-1", email: "op@example.com", name: "Op", features: ["admin.tickets"] },
};
const TICKET = {
  id: "t1",
  submitterUserId: "u1",
  subject: "Broken thing",
  changeClass: "bug",
  area: "account",
  priority: "normal",
  status: "new",
  assigneeUserId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue(OPERATOR_SESSION);
  mockHasFeature.mockReturnValue(true);
  ticketsFindFirst.mockResolvedValue(TICKET);
  usersFindFirst.mockResolvedValue({ email: "member@example.com" });
  mockValidateTransition.mockResolvedValue({ ok: true, from: "new" });
});

describe("authorization short-circuits", () => {
  it("no session → Not signed in, nothing touched", async () => {
    auth.mockResolvedValue(null);
    const r = await setTicketStatusAction("t1", "triaged");
    expect(r).toEqual({ ok: false, error: "Not signed in." });
    expect(dbUpdateSpy).not.toHaveBeenCalled();
  });

  it("missing admin.tickets → Forbidden, nothing touched", async () => {
    mockHasFeature.mockReturnValue(false);
    const r = await setTicketStatusAction("t1", "triaged");
    expect(r).toEqual({ ok: false, error: "Forbidden." });
    expect(dbUpdateSpy).not.toHaveBeenCalled();
  });
});

describe("setTicketStatusAction", () => {
  it("sabotage: an illegal transition never reaches db.update", async () => {
    mockValidateTransition.mockResolvedValue({
      ok: false,
      error: "Cannot change status from 'resolved' to 'declined'.",
    });
    const r = await setTicketStatusAction("t1", "declined");
    expect(r.ok).toBe(false);
    expect(dbUpdateSpy).not.toHaveBeenCalled();
    expect(recordAuditSpy).not.toHaveBeenCalled();
  });

  it("a legal transition updates, audits, and does NOT email on a non-terminal move", async () => {
    const r = await setTicketStatusAction("t1", "triaged");
    expect(r).toEqual({ ok: true });
    expect(dbUpdateSpy).toHaveBeenCalledTimes(1);
    expect(recordAuditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ticket.status_changed" }),
    );
    expect(notifyResolutionSpy).not.toHaveBeenCalled();
  });

  it("resolving emails the submitter", async () => {
    mockValidateTransition.mockResolvedValue({ ok: true, from: "in_progress" });
    const r = await setTicketStatusAction("t1", "resolved");
    expect(r).toEqual({ ok: true });
    expect(notifyResolutionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ submitterEmail: "member@example.com", resolvedAs: "resolved" }),
    );
  });
});

describe("vocabulary actions", () => {
  it("rejects a value outside the controlled vocabulary", async () => {
    const r = await setTicketPriorityAction("t1", "asap");
    expect(r).toEqual({ ok: false, error: "Unknown value 'asap'." });
    expect(dbUpdateSpy).not.toHaveBeenCalled();
  });

  it("a same-value set is a no-op success (no timeline noise)", async () => {
    const r = await setTicketPriorityAction("t1", "normal");
    expect(r).toEqual({ ok: true });
    expect(dbUpdateSpy).not.toHaveBeenCalled();
    expect(recordAuditSpy).not.toHaveBeenCalled();
  });

  it("a real change updates and audits", async () => {
    const r = await setTicketPriorityAction("t1", "urgent");
    expect(r).toEqual({ ok: true });
    expect(dbUpdateSpy).toHaveBeenCalledTimes(1);
    expect(recordAuditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ticket.priority_changed" }),
    );
  });
});

describe("replyToTicketAsOperatorAction", () => {
  it("rejects an empty body before touching the db", async () => {
    const r = await replyToTicketAsOperatorAction("t1", "   ");
    expect(r.ok).toBe(false);
    expect(dbInsertSpy).not.toHaveBeenCalled();
  });

  it("inserts the message and emails the submitter", async () => {
    const r = await replyToTicketAsOperatorAction("t1", "On it.");
    expect(r).toEqual({ ok: true });
    expect(dbInsertSpy).toHaveBeenCalledTimes(1);
    expect(notifyReplySpy).toHaveBeenCalledWith(
      expect.objectContaining({ submitterEmail: "member@example.com" }),
    );
  });
});

describe("promoteFeedbackToTicketAction", () => {
  it("passes validateFeedbackPromotion's rejection through verbatim", async () => {
    mockValidatePromotion.mockResolvedValue({
      ok: false,
      error: "Already promoted to a ticket.",
    });
    const r = await promoteFeedbackToTicketAction("f1");
    expect(r).toEqual({ ok: false, error: "Already promoted to a ticket." });
    expect(dbInsertSpy).not.toHaveBeenCalled();
  });

  it("creates the ticket, stamps the feedback row, audits, and emails", async () => {
    mockValidatePromotion.mockResolvedValue({
      ok: true,
      row: { id: "f1", userId: "u1", body: "please add exports", status: "new" },
    });
    const r = await promoteFeedbackToTicketAction("f1");
    expect(r).toEqual({ ok: true, data: { ticketId: "t-new" } });
    expect(dbUpdateSpy).toHaveBeenCalledTimes(1); // the feedback stamp
    expect(recordAuditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: "feedback.promoted_to_ticket" }),
    );
    expect(notifyPromotionSpy).toHaveBeenCalled();
  });
});
