// @vitest-environment jsdom
/**
 * Regression tests for <FreshRecoveryCodes>.
 *
 * Key invariant from BUG-2: the `onDisplayed` server action must be called
 * exactly once after the component mounts — it deletes the one-time cookie
 * that delivered the codes. If it fires more than once (or not at all), the
 * cookie clear is either skipped or doubled. The empty dep array on the
 * useEffect is the implementation mechanism; these tests verify the contract.
 *
 * jsdom is required because the component uses useEffect. The inline
 * @vitest-environment annotation overrides the project-level "node" env
 * for this file only.
 */

import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import { FreshRecoveryCodes } from "./fresh-recovery-codes";

describe("FreshRecoveryCodes", () => {
  // ── Rendering ─────────────────────────────────────────────────────────────

  it("renders the amber block with the heading and all provided codes", async () => {
    // Arrange
    const onDisplayed = vi.fn().mockResolvedValue(undefined);
    const codes = ["ABCD-EFGH", "IJKL-MNOP", "QRST-UVWX"];

    // Act
    let container: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <FreshRecoveryCodes codes={codes} onDisplayed={onDisplayed} />,
      ));
    });

    // Assert — heading and each code must appear in the rendered output
    expect(container!.textContent).toContain("Save these recovery codes");
    for (const code of codes) {
      expect(container!.textContent).toContain(code);
    }
  });

  // ── Cookie clear via onDisplayed ─────────────────────────────────────────

  it("calls onDisplayed exactly once after mount — regression for BUG-2: cookie not cleared on first display", async () => {
    // Arrange
    const onDisplayed = vi.fn().mockResolvedValue(undefined);

    // Act
    await act(async () => {
      render(<FreshRecoveryCodes codes={["CODE-1234"]} onDisplayed={onDisplayed} />);
    });

    // Assert — must be exactly 1; 0 means the cookie would never be cleared
    // (codes re-appear on every reload); >1 would be a spurious no-op but
    // signals that the dep array guard is broken.
    expect(onDisplayed).toHaveBeenCalledTimes(1);
  });

  it("does not call onDisplayed a second time on re-render with same props", async () => {
    // Arrange
    const onDisplayed = vi.fn().mockResolvedValue(undefined);
    const codes = ["CODE-1234"];
    let rerender: ReturnType<typeof render>["rerender"];

    await act(async () => {
      ({ rerender } = render(
        <FreshRecoveryCodes codes={codes} onDisplayed={onDisplayed} />,
      ));
    });

    // onDisplayed called once on initial mount
    expect(onDisplayed).toHaveBeenCalledTimes(1);

    // Act — re-render with same props (simulates a parent re-render, not
    // unmount + remount). The empty dep array means the effect should NOT fire
    // again.
    await act(async () => {
      rerender!(<FreshRecoveryCodes codes={codes} onDisplayed={onDisplayed} />);
    });

    // Assert — still exactly 1; the empty dep array must hold
    expect(onDisplayed).toHaveBeenCalledTimes(1);
  });
});
