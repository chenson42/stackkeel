import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { RoleMultiSelect } from "./role-multi-select";

// Coverage for 2026-09-10-app-scoped-roles-and-multiselect, Phase 4
// Increment 2. RoleMatrix's own table/switch grid stays covered by
// role-matrix.test.tsx (unaffected — RoleMatrix itself is untouched); this
// file is new, for the new primitive that replaces it at ADMIN's
// /users/[id] only.
//
// No ResizeObserver stub needed here (unlike role-matrix.test.tsx) —
// @radix-ui/react-checkbox, unlike @radix-ui/react-switch, has no
// useSize()/ResizeObserver dependency (confirmed: zero hits for
// "ResizeObserver" anywhere under its installed package).
//
// No @testing-library/jest-dom in this package (role-matrix.test.tsx's own
// header, my-feedback-list.test.tsx's own header — deliberate, no new
// dependency): every assertion below is a plain DOM read (.getAttribute,
// the native .disabled boolean property, .textContent, queryByX returning
// null / getByX throwing), never a jest-dom matcher like
// toBeInTheDocument/toBeDisabled/toHaveAttribute.
afterEach(() => {
  cleanup();
});

const apps = [
  {
    id: "billing",
    label: "Billing",
    levels: [
      { id: "billing_admin", label: "Admin" },
      { id: "billing_editor", label: "Billing Edit" },
    ],
  },
  {
    id: "portal",
    label: "Portal",
    levels: [{ id: "portal_admin", label: "Admin" }],
  },
  {
    id: "admin",
    label: "ADMIN",
    levels: [{ id: "admin_admin", label: "Admin" }],
  },
];

describe("RoleMultiSelect — grouping and disambiguation", () => {
  it("renders one fieldset legend per app, and disambiguates three same-labelled 'Admin' roles by accessible name", () => {
    render(<RoleMultiSelect apps={apps} cells={{}} onToggle={() => {}} />);

    // Three distinct group legends — this is what stops a flat list from
    // rendering "Admin" three times with nothing telling them apart. Throws
    // (failing the test) if any is missing.
    for (const label of ["Billing", "Portal", "ADMIN"]) {
      screen.getByText(label, { selector: "legend" });
    }

    // Each "Admin" checkbox has its OWN accessible name combining app +
    // role — this is the concrete disambiguation, not just visual grouping.
    // getByRole throws if the accessible name doesn't resolve to exactly
    // one match, which is the assertion.
    screen.getByRole("checkbox", { name: "Billing — Admin" });
    screen.getByRole("checkbox", { name: "Portal — Admin" });
    screen.getByRole("checkbox", { name: "ADMIN — Admin" });

    // Exactly 4 checkboxes total (2 + 1 + 1 levels across all three apps).
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });

  it("gives every checkbox a real, htmlFor-associated <label> carrying the role's own display name (Accessibility invariant)", () => {
    render(<RoleMultiSelect apps={apps} cells={{}} onToggle={() => {}} />);

    const editCheckbox = screen.getByRole("checkbox", { name: "Billing — Billing Edit" });
    const id = editCheckbox.getAttribute("id");
    expect(id).toBeTruthy();
    const label = document.querySelector(`label[for="${id}"]`);
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe("Billing Edit");
  });

  it("reflects the cells prop as checked/unchecked", () => {
    render(
      <RoleMultiSelect
        apps={apps}
        cells={{ portal: { portal_admin: true } }}
        onToggle={() => {}}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Portal — Admin" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("checkbox", { name: "Billing — Admin" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("fires onToggle with (appId, levelId, true) when an unchecked cell is clicked", () => {
    const onToggle = vi.fn();
    render(<RoleMultiSelect apps={apps} cells={{}} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "ADMIN — Admin" }));
    expect(onToggle).toHaveBeenCalledWith("admin", "admin_admin", true);
  });

  it("fires onToggle with (appId, levelId, false) when an already-checked cell is clicked", () => {
    const onToggle = vi.fn();
    render(
      <RoleMultiSelect
        apps={apps}
        cells={{ admin: { admin_admin: true } }}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "ADMIN — Admin" }));
    expect(onToggle).toHaveBeenCalledWith("admin", "admin_admin", false);
  });
});

describe("RoleMultiSelect — pending and disabled", () => {
  it("disables a cell whose key is in `pending`, without disabling any other cell", () => {
    render(
      <RoleMultiSelect
        apps={apps}
        cells={{}}
        onToggle={() => {}}
        pending={new Set(["portal:portal_admin"])}
      />,
    );
    const pendingCb = screen.getByRole("checkbox", { name: "Portal — Admin" }) as HTMLButtonElement;
    const otherCb = screen.getByRole("checkbox", { name: "Billing — Admin" }) as HTMLButtonElement;
    expect(pendingCb.disabled).toBe(true);
    expect(otherCb.disabled).toBe(false);
  });

  it("disables every cell when `disabled` is set on the whole component (self-row read-only), never hidden", () => {
    render(<RoleMultiSelect apps={apps} cells={{}} onToggle={() => {}} disabled />);
    const checkboxes = screen.getAllByRole("checkbox") as HTMLButtonElement[];
    // Still rendered, not hidden — "renders read-only, never hidden" per
    // this component's own header.
    expect(checkboxes).toHaveLength(4);
    for (const cb of checkboxes) {
      expect(cb.disabled).toBe(true);
    }
  });
});

describe("RoleMultiSelect — disabledCells (permanent, protected)", () => {
  it("renders a listed cell as permanently disabled with its reason visible, and never calls onToggle", () => {
    const onToggle = vi.fn();
    render(
      <RoleMultiSelect
        apps={[apps[2]]}
        cells={{ admin: { admin_admin: true } }}
        onToggle={onToggle}
        disabledCells={{ "admin:admin_admin": "Required — cannot be removed." }}
      />,
    );
    const cb = screen.getByRole("checkbox", { name: "ADMIN — Admin" }) as HTMLButtonElement;
    expect(cb.disabled).toBe(true);
    // Throws (failing the test) if the reason isn't actually rendered.
    screen.getByText("Required — cannot be removed.");

    fireEvent.click(cb);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("RoleMultiSelect — cellErrors (Phase 2 § D: inline, not toast-only)", () => {
  it("renders a per-cell error inline, as role=alert, associated to the checkbox via aria-describedby", () => {
    render(
      <RoleMultiSelect
        apps={apps}
        cells={{}}
        onToggle={() => {}}
        cellErrors={{
          "portal:portal_admin":
            "This user already holds the staff persona — remove it before granting portal_admin.",
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("already holds the staff persona");

    const cb = screen.getByRole("checkbox", { name: "Portal — Admin" });
    const describedBy = cb.getAttribute("aria-describedby");
    expect(describedBy).toContain(alert.id);
  });

  it("does not render any alert when cellErrors is omitted (the common case)", () => {
    render(<RoleMultiSelect apps={apps} cells={{}} onToggle={() => {}} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("RoleMultiSelect — empty state", () => {
  it("renders a helpful empty message with no apps, and no checkboxes", () => {
    render(<RoleMultiSelect apps={[]} cells={{}} onToggle={() => {}} />);
    // Throws (failing the test) if the empty-state message isn't rendered.
    screen.getByText("No role namespaces to show yet.");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
