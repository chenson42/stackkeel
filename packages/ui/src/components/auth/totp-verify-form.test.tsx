import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import { TotpVerifyForm } from "./totp-verify-form";

// Phase 4 regression coverage for apps/admin/docs/work-log/2026-09-10-2fa-
// input-and-app-labels.md, Defect 1: the 6-slot boxes disappeared for
// every call site that turned recovery-code support on, because
// `acceptsRecoveryCode` used to gate two MUTUALLY EXCLUSIVE renders
// instead of "boxes always first, plus an optional escape hatch." These
// tests exist so that regression can't silently come back — each one
// fails against the pre-fix component (verified below, in this file's own
// revert-proof note) and passes against the fixed one.
//
// No @testing-library/jest-dom in this package (see
// my-feedback-list.test.tsx's own header — never added here). Plain DOM
// assertions (`.value`, `.textContent`, `.className`, `queryBy*` returning
// null) do the same job without a new dependency.
//
// jsdom does not implement a real paste pipeline the way a browser does
// (no native default-paste action to prevent), so the paste tests below
// drive TotpVerifyForm's own `handleBoxesPaste` directly via
// `fireEvent.paste(el, { clipboardData: { getData: () => ... } })` — this
// exercises the real handler and its real preventDefault()/state-update
// logic, not a mock of it. What it can NOT prove is that preventDefault()
// actually stops a real browser's native paste before InputOTP's own
// onChange sees it — that half is only provable in a real browser, and is
// covered by this work-log's e2e paste spec instead (see the Phase 4
// section's "What was NOT verified").
// input-otp's own password-manager-badge detection (its `pushPasswordManagerStrategy`
// default, "increase-width") polls `document.elementFromPoint` on a
// setTimeout chain — jsdom has never implemented that method, and this is
// the first test in packages/ui to render InputOTP at all, so nothing
// surfaced this before. Left unpolyfilled, vitest reports the run as
// failed via unhandled background-timer exceptions even though every
// assertion passes. A minimal polyfill, not a behavior change to the
// component under test — production still runs against a real browser's
// real elementFromPoint.
if (typeof document.elementFromPoint !== "function") {
  document.elementFromPoint = () => null;
}

afterEach(() => {
  cleanup();
});

function otpHiddenInput(container: HTMLElement): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>("[data-input-otp]");
  if (!el) throw new Error("expected InputOTP's hidden input to be present");
  return el;
}

describe("TotpVerifyForm", () => {
  it("renders the 6-slot boxes by default when acceptsRecoveryCode is omitted (a predecessor app legacy /totp, Admin) — no recovery link, no text field", () => {
    const { container } = render(
      <TotpVerifyForm app="admin" callbackUrl="/users" onSubmitTotp={vi.fn()} />,
    );
    expect(container.querySelector("[data-input-otp]")).toBeTruthy();
    expect(screen.queryByText("Use a recovery code instead")).toBeNull();
    expect(screen.queryByLabelText("Recovery code")).toBeNull();
  });

  it("renders the 6-slot boxes FIRST even when acceptsRecoveryCode is true — the actual Defect 1 regression", () => {
    const { container } = render(
      <TotpVerifyForm
        app="portal"
        callbackUrl="/home"
        onSubmitTotp={vi.fn()}
        acceptsRecoveryCode
      />,
    );
    // Pre-fix, this call site rendered a single free-text field and NO
    // boxes at all — this assertion is what would fail against that code.
    expect(container.querySelector("[data-input-otp]")).toBeTruthy();
    expect(screen.queryByLabelText("Recovery code")).toBeNull();
    expect(screen.getByText("Use a recovery code instead")).toBeTruthy();
  });

  it("the recovery-code link swaps to a free-text field, moves focus into it, and announces the change", async () => {
    render(
      <TotpVerifyForm
        app="a predecessor app"
        callbackUrl="/dashboard"
        onSubmitTotp={vi.fn()}
        acceptsRecoveryCode
      />,
    );
    fireEvent.click(screen.getByText("Use a recovery code instead"));

    const recoveryInput = await screen.findByLabelText("Recovery code");
    expect(document.activeElement).toBe(recoveryInput);
    expect(screen.getByText("Switched to recovery code entry.")).toBeTruthy();
    // Boxes are gone, and the link now offers the way back.
    expect(document.querySelector("[data-input-otp]")).toBeNull();
    expect(screen.getByText("Enter a 6-digit code instead")).toBeTruthy();

    // And back again — round-trip, not a one-way door.
    fireEvent.click(screen.getByText("Enter a 6-digit code instead"));
    await waitFor(() => {
      expect(screen.getByText("Switched to authenticator code entry.")).toBeTruthy();
    });
    expect(document.querySelector("[data-input-otp]")).toBeTruthy();
  });

  it("pasting a clean 6-digit code into the boxes fills them and auto-submits, exactly like typing the 6th digit does", async () => {
    const onSubmitTotp = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <TotpVerifyForm app="a predecessor app" callbackUrl="/dashboard" onSubmitTotp={onSubmitTotp} />,
    );
    const hiddenInput = otpHiddenInput(container);
    fireEvent.paste(hiddenInput, { clipboardData: { getData: () => "123456" } });

    await waitFor(() => {
      expect(onSubmitTotp).toHaveBeenCalledWith({ code: "123456", callbackUrl: "/dashboard" });
    });
  });

  it("tolerates surrounding whitespace on a pasted 6-digit code (InputOTP's own native path would reject this)", async () => {
    const onSubmitTotp = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <TotpVerifyForm app="a predecessor app" callbackUrl="/dashboard" onSubmitTotp={onSubmitTotp} />,
    );
    const hiddenInput = otpHiddenInput(container);
    fireEvent.paste(hiddenInput, { clipboardData: { getData: () => " 123456\n" } });

    await waitFor(() => {
      expect(onSubmitTotp).toHaveBeenCalledWith({ code: "123456", callbackUrl: "/dashboard" });
    });
  });

  it("pasting a recovery-code-shaped string into the boxes hands off to the recovery field instead of being silently rejected — only when acceptsRecoveryCode is true", async () => {
    const onSubmitTotp = vi.fn();
    const { container } = render(
      <TotpVerifyForm
        app="portal"
        callbackUrl="/home"
        onSubmitTotp={onSubmitTotp}
        acceptsRecoveryCode
      />,
    );
    const hiddenInput = otpHiddenInput(container);
    fireEvent.paste(hiddenInput, { clipboardData: { getData: () => "ABCD-EFGH" } });

    const recoveryInput = (await screen.findByLabelText("Recovery code")) as HTMLInputElement;
    // No @testing-library/jest-dom in this package (see
    // my-feedback-list.test.tsx's own header) — plain `.value`, not
    // toHaveValue().
    expect(recoveryInput.value).toBe("ABCD-EFGH");
    // Not silently truncated to 6 chars by the boxes' own maxLength, and
    // not auto-submitted — recovery entry stays explicit-submit.
    expect(onSubmitTotp).not.toHaveBeenCalled();
  });

  it("a recovery-shaped paste does NOT switch modes when acceptsRecoveryCode is false — there is nothing to hand off to", () => {
    const { container } = render(
      <TotpVerifyForm app="admin" callbackUrl="/users" onSubmitTotp={vi.fn()} />,
    );
    const hiddenInput = otpHiddenInput(container);
    fireEvent.paste(hiddenInput, { clipboardData: { getData: () => "ABCD-EFGH" } });

    expect(screen.queryByLabelText("Recovery code")).toBeNull();
    expect(container.querySelector("[data-input-otp]")).toBeTruthy();
  });

  it("renders a wrong-code error with the boxed role=alert treatment, never bare text-destructive (UX-PATTERNS.md § 6)", async () => {
    const onSubmitTotp = vi.fn().mockResolvedValue({ error: "That code didn't match. Try again." });
    const { container } = render(
      <TotpVerifyForm app="a predecessor app" callbackUrl="/dashboard" onSubmitTotp={onSubmitTotp} />,
    );
    const hiddenInput = otpHiddenInput(container);
    fireEvent.paste(hiddenInput, { clipboardData: { getData: () => "000000" } });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("That code didn't match. Try again.");
    expect(alert.className).toContain("border-destructive/30");
    expect(alert.className).toContain("bg-destructive/10");
    expect(alert.className).not.toContain("text-destructive");
  });
});
