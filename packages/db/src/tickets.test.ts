import { describe, it, expect } from "vitest";
import {
  CHANGE_CLASSES,
  TICKET_AREAS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TRANSITIONS,
  SUBJECT_MAX,
  TICKET_BODY_MAX,
  validateFileTicketInput,
  validateTicketReply,
  validateTicketTransition,
  validateFeedbackPromotion,
} from "./tickets";

function ticketDbStub(existingStatus: string | null) {
  return {
    query: {
      tickets: {
        findFirst: async () =>
          existingStatus === null ? undefined : { status: existingStatus },
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function feedbackDbStub(
  row: { id: string; userId: string; body: string; status: string; promotedToTicketId: string | null } | null,
) {
  return {
    query: {
      feedback: { findFirst: async () => row ?? undefined },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("TICKET_TRANSITIONS", () => {
  it("every status has a transition entry and every target is a known status", () => {
    for (const s of TICKET_STATUSES) {
      expect(TICKET_TRANSITIONS[s]).toBeDefined();
      for (const t of TICKET_TRANSITIONS[s]) {
        expect(TICKET_STATUSES).toContain(t);
      }
    }
  });

  it("resolved and declined can be reopened to in_progress only", () => {
    expect(TICKET_TRANSITIONS.resolved).toEqual(["in_progress"]);
    expect(TICKET_TRANSITIONS.declined).toEqual(["in_progress"]);
  });

  it("no status transitions to itself", () => {
    for (const s of TICKET_STATUSES) {
      expect(TICKET_TRANSITIONS[s]).not.toContain(s);
    }
  });
});

describe("validateFileTicketInput", () => {
  const valid = {
    subject: "Cannot update my profile photo",
    body: "Steps: open account, choose photo, save — nothing happens.",
    changeClass: "bug",
    area: "account",
    priority: "normal",
  };

  it("accepts a fully valid input", () => {
    expect(validateFileTicketInput(valid)).toEqual({ kind: "ok" });
  });

  it("rejects empty and over-long subject/body with specific errors", () => {
    const r1 = validateFileTicketInput({ ...valid, subject: "   " });
    expect(r1.kind).toBe("invalid_input");
    const r2 = validateFileTicketInput({ ...valid, subject: "x".repeat(SUBJECT_MAX + 1) });
    expect(r2.kind).toBe("invalid_input");
    const r3 = validateFileTicketInput({ ...valid, body: "x".repeat(TICKET_BODY_MAX + 1) });
    expect(r3.kind).toBe("invalid_input");
  });

  it("rejects values outside each controlled vocabulary", () => {
    for (const patch of [
      { changeClass: "urgent" }, // a priority, not a class
      { area: "directory" }, // an ancestor-vocabulary value, deliberately absent
      { priority: "asap" },
    ]) {
      const r = validateFileTicketInput({ ...valid, ...patch });
      expect(r.kind).toBe("invalid_input");
    }
  });

  it("collects multiple errors in one pass", () => {
    const r = validateFileTicketInput({
      subject: "",
      body: "",
      changeClass: "nope",
      area: "nope",
      priority: "nope",
    });
    expect(r.kind).toBe("invalid_input");
    if (r.kind === "invalid_input") expect(r.errors.length).toBe(5);
  });
});

describe("validateTicketReply", () => {
  it("accepts a normal reply and trims before measuring", () => {
    expect(validateTicketReply("  thanks, that fixed it  ")).toEqual({ kind: "ok" });
  });
  it("rejects empty and over-long bodies", () => {
    expect(validateTicketReply("   ").kind).toBe("invalid_input");
    expect(validateTicketReply("x".repeat(TICKET_BODY_MAX + 1)).kind).toBe("invalid_input");
  });
});

describe("validateTicketTransition", () => {
  it("rejects unknown target statuses outright", async () => {
    const r = await validateTicketTransition(ticketDbStub("new"), "t1", "bogus");
    expect(r).toEqual({ ok: false, error: "Invalid status 'bogus'." });
  });

  it("rejects a transition for a missing ticket", async () => {
    const r = await validateTicketTransition(ticketDbStub(null), "t1", "triaged");
    expect(r).toEqual({ ok: false, error: "Ticket not found." });
  });

  it("allows every legal edge and reports the from-status", async () => {
    for (const from of TICKET_STATUSES) {
      for (const to of TICKET_TRANSITIONS[from]) {
        const r = await validateTicketTransition(ticketDbStub(from), "t1", to);
        expect(r).toEqual({ ok: true, from });
      }
    }
  });

  it("rejects every illegal edge", async () => {
    for (const from of TICKET_STATUSES) {
      const legal = new Set<string>(TICKET_TRANSITIONS[from]);
      for (const to of TICKET_STATUSES) {
        if (legal.has(to) || to === from) continue;
        const r = await validateTicketTransition(ticketDbStub(from), "t1", to);
        expect(r.ok).toBe(false);
      }
    }
  });
});

describe("validateFeedbackPromotion", () => {
  const base = { id: "f1", userId: "u1", body: "please add exports", promotedToTicketId: null };

  it("accepts new and triaged feedback", async () => {
    for (const status of ["new", "triaged"]) {
      const r = await validateFeedbackPromotion(feedbackDbStub({ ...base, status }), "f1");
      expect(r.ok).toBe(true);
    }
  });

  it("rejects a missing row, terminal statuses, and double promotion", async () => {
    expect((await validateFeedbackPromotion(feedbackDbStub(null), "f1")).ok).toBe(false);
    for (const status of ["done", "declined"]) {
      const r = await validateFeedbackPromotion(feedbackDbStub({ ...base, status }), "f1");
      expect(r.ok).toBe(false);
    }
    const r = await validateFeedbackPromotion(
      feedbackDbStub({ ...base, status: "triaged", promotedToTicketId: "t9" }),
      "f1",
    );
    expect(r).toEqual({ ok: false, error: "Already promoted to a ticket." });
  });
});

describe("vocabulary sanity", () => {
  it("vocabularies are non-empty and disjoint from each other where it matters", () => {
    expect(CHANGE_CLASSES.length).toBeGreaterThan(0);
    expect(TICKET_AREAS.length).toBeGreaterThan(0);
    expect(TICKET_PRIORITIES.length).toBeGreaterThan(0);
    // statuses and priorities must not overlap — a UI that confuses the two
    // selects would otherwise pass validation by accident.
    for (const p of TICKET_PRIORITIES) {
      expect(TICKET_STATUSES as readonly string[]).not.toContain(p);
    }
  });
});
