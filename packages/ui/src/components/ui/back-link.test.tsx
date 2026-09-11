import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { BackLink } from "./back-link";

// Component-level companion to ../../lib/back-link.test.ts, which covers
// resolveBackLink's contract (the label always starts with "Back to " and
// is never the bare string "Back"). That guarantee is only real end-to-end
// if BackLink itself (a) renders as a real <a> — never a <button> or a
// div with an onClick, which is exactly the wrong-element defect this
// component was promoted to close (2026-09-07-back-nav-and-shell-
// consistency, Phase 1 § A: a predecessor app's participant detail page used a
// <Button> + router.back() instead) — and (b) renders the caller's label
// text verbatim, with no truncation/template logic of its own that could
// silently turn a resolved "Back to Classes" back into a bare "Back".
afterEach(() => {
  cleanup();
});

describe("BackLink", () => {
  it("should render as a real anchor element, never a button — regression for the pre-promotion <Button> + router.back() back links", () => {
    const { container } = render(<BackLink href="/participants" label="Back to Participants" />);

    const anchor = container.querySelector("a");

    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("href")).toBe("/participants");
    expect(container.querySelector("button")).toBeNull();
  });

  it("should render the caller-supplied label verbatim, with no truncation or bare-'Back' fallback of its own", () => {
    const { getByText, queryByText } = render(
      <BackLink href="/dashboard" label="Back to Release Mentoring Dashboard" />,
    );

    expect(getByText("Back to Release Mentoring Dashboard")).toBeTruthy();
    expect(queryByText(/^Back$/)).toBeNull();
  });
});
