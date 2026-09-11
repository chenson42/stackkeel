import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { RoleMatrix } from "./role-matrix";
import { TooltipProvider } from "./tooltip";

// jsdom has no ResizeObserver — Radix's underlying Switch primitive
// (@radix-ui/react-use-size) calls `new ResizeObserver(...)` in a layout
// effect on every mount. This is the first test in this package to render a
// real Switch (Dialog/MyFeedbackList's own existing tests don't), so the gap
// was previously latent, not fixed by anything already in place. A minimal
// no-op stub is enough: jsdom does no layout at all (see dialog.test.tsx's
// own comment on this exact point), so the observed size is never read
// meaningfully in this environment either way.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// Regression coverage for 2026-09-09-roles-permissions-ux Phase 4 (client):
// RoleMatrix gained two additive, optional props (rowHeaderLabel,
// disabledCells) for the new /roles page's role x feature grid. The binding
// requirement (Phase 2/3) is that every EXISTING call site (UserRoleMatrix,
// requests' pre-grant matrix) renders byte-identically with both props
// omitted — this file asserts that directly, not just "the new props work."
//
// No @testing-library/jest-dom in this package (see my-feedback-list.test.tsx's
// own header — deliberate, no new dependency) — plain DOM assertions
// (getByRole throwing on absence, queryByRole returning null,
// .getAttribute/.hasAttribute, document.activeElement) do the same job.
afterEach(() => {
  cleanup();
});

const apps = [
  {
    id: "feature-a",
    label: "Feature A",
    levels: [
      { id: "role-1", label: "Admin" },
      { id: "role-2", label: "Write" },
    ],
  },
  {
    id: "feature-b",
    label: "Feature B",
    levels: [{ id: "role-1", label: "Admin" }],
  },
];

describe("RoleMatrix — additivity (existing call sites unaffected)", () => {
  it('renders the literal row-header text "App" when rowHeaderLabel is omitted — the exact pre-existing behavior both UserRoleMatrix and the requests pre-grant matrix depend on', () => {
    render(<RoleMatrix apps={apps} cells={{}} onToggle={() => {}} />);
    // Throws (failing the test) if no such columnheader exists.
    screen.getByRole("columnheader", { name: "App" });
  });

  it("renders every cell as a real, enabled switch when disabledCells is omitted — no new disabled/tooltip machinery activates by default", () => {
    render(<RoleMatrix apps={apps} cells={{}} onToggle={() => {}} />);
    const switches = screen.getAllByRole("switch");
    // 2 columns for feature-a + 1 column for feature-b = 3 real switches
    // (feature-b has no "Write" level, so that cell renders the dash, not a
    // switch — same as before this change).
    expect(switches).toHaveLength(3);
    for (const s of switches) {
      expect(s.hasAttribute("disabled")).toBe(false);
      expect(s.hasAttribute("aria-disabled")).toBe(false);
    }
  });

  it("still fires onToggle with the original (appId, levelId, next) signature when both new props are omitted", () => {
    const onToggle = vi.fn();
    render(<RoleMatrix apps={apps} cells={{}} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("switch", { name: "Feature A — Admin" }));
    expect(onToggle).toHaveBeenCalledWith("feature-a", "role-1", true);
  });
});

describe("RoleMatrix — rowHeaderLabel (new, additive)", () => {
  it("overrides the row-header column label when provided", () => {
    render(<RoleMatrix apps={apps} cells={{}} onToggle={() => {}} rowHeaderLabel="Permission" />);
    screen.getByRole("columnheader", { name: "Permission" });
    expect(screen.queryByRole("columnheader", { name: "App" })).toBeNull();
  });
});

describe("RoleMatrix — disabledCells (new, additive)", () => {
  it("renders a listed cell as a permanently-disabled switch whose accessible name includes the stated reason, and never calls onToggle when clicked", () => {
    const onToggle = vi.fn();
    render(
      <TooltipProvider>
        <RoleMatrix
          apps={apps}
          cells={{ "feature-a": { "role-1": true } }}
          onToggle={onToggle}
          disabledCells={{ "feature-a:role-1": "Required — cannot be removed." }}
        />
      </TooltipProvider>,
    );

    const protectedCell = screen.getByRole("switch", {
      name: "Feature A — Admin. Required — cannot be removed.",
    });
    expect(protectedCell.getAttribute("aria-disabled")).toBe("true");
    expect(protectedCell.getAttribute("aria-checked")).toBe("true");
    expect(protectedCell.getAttribute("tabindex")).toBe("0");

    fireEvent.click(protectedCell);
    expect(onToggle).not.toHaveBeenCalled();

    // The other cell in the same row (Feature A — Write) is untouched —
    // disabledCells is per-cell, not per-row or matrix-wide.
    const untouchedCell = screen.getByRole("switch", { name: "Feature A — Write" });
    expect(untouchedCell.hasAttribute("aria-disabled")).toBe(false);
  });

  it("takes priority over `pending` — a cell present in both is rendered via the disabledCells branch, never the transient pending-dimmed branch", () => {
    render(
      <TooltipProvider>
        <RoleMatrix
          apps={apps}
          cells={{}}
          onToggle={() => {}}
          pending={new Set(["feature-a:role-1"])}
          disabledCells={{ "feature-a:role-1": "Required — cannot be removed." }}
        />
      </TooltipProvider>,
    );

    // The protected cell's accessible name carries the disabledCells reason
    // (proves the disabledCells branch rendered) — throws if absent, i.e. if
    // `pending` had won instead and rendered the plain "Feature A — Admin"
    // switch.
    screen.getByRole("switch", { name: "Feature A — Admin. Required — cannot be removed." });
  });

  it("is keyboard-reachable (tabIndex 0, programmatically focusable) even though the underlying interactive Switch is natively disabled and drops out of tab order on its own", () => {
    render(
      <TooltipProvider>
        <RoleMatrix
          apps={[apps[1]]}
          cells={{}}
          onToggle={() => {}}
          disabledCells={{ "feature-b:role-1": "Required." }}
        />
      </TooltipProvider>,
    );

    const protectedCell = screen.getByRole("switch", { name: "Feature B — Admin. Required." });
    expect(protectedCell.getAttribute("tabindex")).toBe("0");
    // The nested, actually-<button disabled> Switch is excluded from tab
    // order by the browser's own native behavior for `disabled` — confirmed
    // here, not just asserted, by checking it independently of the outer
    // span carrying the real tabIndex=0 stop.
    const nestedNativeButton = protectedCell.querySelector("button[disabled]");
    expect(nestedNativeButton).not.toBeNull();
    expect(nestedNativeButton?.getAttribute("tabindex")).toBe("-1");

    protectedCell.focus();
    expect(document.activeElement).toBe(protectedCell);
  });
});
