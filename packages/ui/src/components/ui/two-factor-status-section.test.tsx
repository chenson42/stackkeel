import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TwoFactorStatusSection } from "./two-factor-status-section";

// Phase 5 verification (2026-09-07-account-settings-audit) for the
// three-state conditional this component's whole design rests on
// (Phase 3 § 3/§ 4 of that work-log). The only judgment call in the
// component — omitting the "Manage" button and swapping in "coming soon"
// copy when `manageHref` is absent, rather than linking to a page that
// cannot succeed for an already-enrolled predecessor apps user — has no
// other test coverage anywhere in the three apps that consume this
// component, so a regression here (e.g. someone "simplifying" the ternary
// and reintroducing a dead-end Manage button) would be invisible to every
// other check in the pipeline.
afterEach(() => {
  cleanup();
});

describe("TwoFactorStatusSection", () => {
  it("should show 'Not enabled' with a working Set up link when the user has not enrolled", () => {
    const { getByText, getByRole, queryByRole } = render(
      <TwoFactorStatusSection enrolled={false} setupHref="/setup-mfa" />,
    );

    expect(getByText("Not enabled")).toBeTruthy();
    const setupLink = getByRole("link", { name: "Set up" });
    expect(setupLink.getAttribute("href")).toBe("/setup-mfa");
    expect(queryByRole("link", { name: "Manage" })).toBeNull();
  });

  it("should show 'Enabled' with a working Manage link when enrolled and a manageHref is supplied", () => {
    const { getByText, getByRole, queryByRole } = render(
      <TwoFactorStatusSection
        enrolled={true}
        setupHref="/account/2fa"
        manageHref="/account/2fa"
      />,
    );

    expect(getByText("Enabled")).toBeTruthy();
    const manageLink = getByRole("link", { name: "Manage" });
    expect(manageLink.getAttribute("href")).toBe("/account/2fa");
    expect(queryByRole("link", { name: "Set up" })).toBeNull();
  });

  it("should show 'Enabled — management tools are coming soon' with NO button when enrolled but no manageHref is supplied — regression for offering a Manage button that can only fail or silently invalidate recovery codes", () => {
    const { getByText, queryByRole } = render(
      <TwoFactorStatusSection enrolled={true} setupHref="/setup-mfa" />,
    );

    expect(
      getByText("Enabled — management tools are coming soon"),
    ).toBeTruthy();
    expect(queryByRole("link", { name: "Manage" })).toBeNull();
    expect(queryByRole("link", { name: "Set up" })).toBeNull();
    expect(queryByRole("button")).toBeNull();
  });
});
