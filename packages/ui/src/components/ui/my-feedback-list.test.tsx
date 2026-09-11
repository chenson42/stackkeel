import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MyFeedbackList, type MyFeedbackItem } from "./my-feedback-list";
import type { ActionResult } from "../../types/actions";

// No global setupFiles/auto-cleanup wired for this package yet (see
// vitest.config.ts's own header — this is the first component test it has
// ever needed), so each render must be torn down explicitly or a later
// test's query can match a still-mounted element from an earlier one.
afterEach(() => {
  cleanup();
});

/**
 * First component test in this package (Increment 5 of the cross-app
 * feedback umbrella, 2026-09-06-feedback-status-view.md, Implementation
 * Order step 2). MyFeedbackList is a pure renderer — it is handed rows via
 * `fetchItems` and never sees a user id, so there is nothing IDOR-shaped to
 * test here; that boundary lives one layer below, in each app's own
 * getMyFeedback() wrapper (see packages/db/src/feedback.test.ts and each
 * app's account/actions.test.ts).
 *
 * No @testing-library/jest-dom here — this repo has never added it
 * (confirmed: zero uses of toBeInTheDocument/toHaveTextContent anywhere).
 * Plain DOM assertions (`.textContent`, `getByText` throwing when absent,
 * `queryByText` returning null) do the same job without a new dependency.
 */

function item(overrides: Partial<MyFeedbackItem> = {}): MyFeedbackItem {
  return {
    id: "row-1",
    app: "portal",
    category: "suggestion",
    body: "Some feedback body",
    status: "new",
    createdAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

function stub(
  result: ActionResult<MyFeedbackItem[]>,
): () => Promise<ActionResult<MyFeedbackItem[]>> {
  return vi.fn().mockResolvedValue(result);
}

describe("MyFeedbackList — loading state", () => {
  it("shows a loading message before fetchItems resolves", () => {
    // A promise that never resolves during this test — asserts the initial
    // render, not the settled state.
    const fetchItems = vi.fn(() => new Promise<never>(() => {}));
    render(<MyFeedbackList fetchItems={fetchItems} />);
    expect(screen.getByRole("status").textContent).toBe(
      "Loading your feedback…",
    );
  });
});

describe("MyFeedbackList — error state", () => {
  it("shows an error message when fetchItems resolves ok:false", async () => {
    render(<MyFeedbackList fetchItems={stub({ ok: false, error: "boom" })} />);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Couldn't load your feedback right now.",
      ),
    );
  });

  it("shows an error message when fetchItems rejects", async () => {
    const fetchItems = vi.fn().mockRejectedValue(new Error("network"));
    render(<MyFeedbackList fetchItems={fetchItems} />);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Couldn't load your feedback right now.",
      ),
    );
  });
});

describe("MyFeedbackList — empty state", () => {
  it("shows the empty-state message when there are zero rows", async () => {
    render(<MyFeedbackList fetchItems={stub({ ok: true, data: [] })} />);
    await waitFor(() =>
      expect(
        screen.getByText("You haven't submitted any feedback yet."),
      ).toBeTruthy(),
    );
  });
});

describe("MyFeedbackList — populated state", () => {
  it("renders one row per item, with its status label and truncated body", async () => {
    render(
      <MyFeedbackList
        fetchItems={stub({
          ok: true,
          data: [item({ id: "row-1", status: "new", body: "First item" })],
        })}
      />,
    );
    await waitFor(() => expect(screen.getByText("First item")).toBeTruthy());
    expect(screen.getByText("Received")).toBeTruthy();
  });

  it("maps every internal status to its member-friendly label", async () => {
    render(
      <MyFeedbackList
        fetchItems={stub({
          ok: true,
          data: [
            item({ id: "1", status: "new", body: "a" }),
            item({ id: "2", status: "triaged", body: "b" }),
            item({ id: "3", status: "done", body: "c" }),
            item({ id: "4", status: "declined", body: "d" }),
          ],
        })}
      />,
    );
    await waitFor(() => expect(screen.getByText("Received")).toBeTruthy());
    expect(screen.getByText("In review")).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByText("Not planned")).toBeTruthy();
  });

  it("falls back to the raw status string for an unknown status value, rather than throwing", async () => {
    render(
      <MyFeedbackList
        fetchItems={stub({
          ok: true,
          data: [item({ status: "some-future-status" })],
        })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("some-future-status")).toBeTruthy(),
    );
  });

  it("renders a known app via AppBadge's label (cross-app aggregation shape)", async () => {
    render(
      <MyFeedbackList
        fetchItems={stub({
          ok: true,
          data: [
            item({ id: "1", app: "portal", body: "a" }),
            item({ id: "2", app: "admin", body: "b" }),
          ],
        })}
      />,
    );
    await waitFor(() => expect(screen.getByText("PORTAL")).toBeTruthy());
    expect(screen.getByText("PORTAL")).toBeTruthy();
    expect(screen.getByText("ADMIN")).toBeTruthy();
  });

  it("falls back to the raw app string for an unknown app value, rather than throwing", async () => {
    render(
      <MyFeedbackList
        fetchItems={stub({ ok: true, data: [item({ app: "some-future-app" })] })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("some-future-app")).toBeTruthy(),
    );
  });

  it("truncates a body over 140 chars on its first line, with an ellipsis", async () => {
    const longBody = "x".repeat(200);
    render(
      <MyFeedbackList
        fetchItems={stub({ ok: true, data: [item({ body: longBody })] })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(`${"x".repeat(140)}…`)).toBeTruthy(),
    );
  });

  it("truncates a multi-line body to its first line only", async () => {
    render(
      <MyFeedbackList
        fetchItems={stub({
          ok: true,
          data: [item({ body: "First line\nSecond line" })],
        })}
      />,
    );
    await waitFor(() => expect(screen.getByText("First line")).toBeTruthy());
    expect(screen.queryByText(/Second line/)).toBeNull();
  });
});
