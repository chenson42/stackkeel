import { describe, it, expect } from "vitest";
import {
  FEEDBACK_TRANSITIONS,
  KNOWN_FEEDBACK_STATUSES,
  validateFeedbackTransition,
} from "./feedback";

function makeDbStub(existingStatus: string | null) {
  return {
    query: {
      feedback: {
        findFirst: async () =>
          existingStatus === null ? undefined : { status: existingStatus },
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("FEEDBACK_TRANSITIONS", () => {
  it("is forward-only with terminal done/declined", () => {
    expect(FEEDBACK_TRANSITIONS.new).toEqual(["triaged", "declined"]);
    expect(FEEDBACK_TRANSITIONS.triaged).toEqual(["done", "declined"]);
    expect(FEEDBACK_TRANSITIONS.done).toEqual([]);
    expect(FEEDBACK_TRANSITIONS.declined).toEqual([]);
  });

  it("every transition target is itself a known status", () => {
    for (const targets of Object.values(FEEDBACK_TRANSITIONS)) {
      for (const t of targets) expect(KNOWN_FEEDBACK_STATUSES.has(t)).toBe(true);
    }
  });
});

describe("validateFeedbackTransition", () => {
  it("rejects unknown statuses outright", async () => {
    const result = await validateFeedbackTransition(makeDbStub("new"), "f1", "bogus");
    expect(result).toEqual({ ok: false, error: "Invalid status 'bogus'." });
  });

  it("rejects a transition for a missing row", async () => {
    const result = await validateFeedbackTransition(makeDbStub(null), "f1", "triaged");
    expect(result).toEqual({ ok: false, error: "Feedback not found." });
  });

  it("allows legal transitions and blocks regressions", async () => {
    expect(await validateFeedbackTransition(makeDbStub("new"), "f1", "triaged")).toEqual({
      ok: true,
    });
    expect(await validateFeedbackTransition(makeDbStub("done"), "f1", "new")).toEqual({
      ok: false,
      error: "Cannot change status from 'done' to 'new'.",
    });
  });
});
