import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

// Regression coverage for DECISION-019 (root docs/decisions.md, 2026-09-07,
// work-log 2026-09-07-dialog-scroll): DialogContent's base className is
// `fixed` and vertically centred by `-translate-y-1/2`, so a dialog taller
// than the viewport overflows in both directions with NO reachable scroll —
// you cannot scroll a `fixed` element, and Radix scroll-locks the page
// behind it. This was hit live on a predecessor app's edit form: the
// footer buttons were simply gone, and 57 of 61 call sites across all three
// apps relied on this shared default, so the missing classes were invisible
// to every one of them. Nothing in the existing suite rendered DialogContent
// and inspected its className before this test, which is exactly how one
// missing pair of Tailwind classes reached production.
//
// This asserts the className directly rather than measuring layout —
// jsdom does no layout at all (every element reports a zero bounding box),
// so a getBoundingClientRect-based assertion would pass unconditionally
// regardless of whether these classes are present. The className is the
// only observable surface jsdom can actually verify here; a real
// overflow/scroll check needs a Playwright bounding-box assertion against
// a real browser, which the dialog-scroll work-log's own Follow-ups
// section names as filed-but-not-built — this test does not replace that,
// it only stops a future edit from silently dropping the two classes.
afterEach(() => {
  cleanup();
});

describe("DialogContent — viewport height guard", () => {
  it("should cap its own height and allow internal scroll, so a dialog taller than the viewport never hides its footer buttons — regression for the 2026-09-07 dialog-scroll bug", () => {
    const { getByTestId } = render(
      <Dialog open>
        <DialogContent data-testid="content">
          <DialogTitle>Regression check</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const content = getByTestId("content");

    expect(content.className).toContain("max-h-[calc(100dvh-2rem)]");
    expect(content.className).toContain("overflow-y-auto");
  });

  it("should let a call site's own max-h/overflow override win over the shared default via tailwind-merge, not stack with it", () => {
    const { getByTestId } = render(
      <Dialog open>
        <DialogContent data-testid="content" className="max-h-[85vh]">
          <DialogTitle>Regression check</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const content = getByTestId("content");

    expect(content.className).toContain("max-h-[85vh]");
    expect(content.className).not.toContain("max-h-[calc(100dvh-2rem)]");
    // overflow-y-auto is a separate tailwind-merge group from max-h-*, so a
    // caller overriding only the height keeps the shared scroll behavior.
    expect(content.className).toContain("overflow-y-auto");
  });
});
