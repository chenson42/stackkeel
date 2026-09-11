"use client"

import * as React from "react"
import { Checkbox } from "./checkbox"
import { cn } from "../../lib/utils"
import type { RoleMatrixApp, RoleMatrixCells } from "./role-matrix"

// New packages/ui primitive (2026-09-10-app-scoped-roles-and-multiselect,
// Phase 3 Component Plan). Replaces RoleMatrix's person x app x level GRID,
// for the one consumer (ADMIN's /users/[id]) where "which roles does this
// user have" is a flat multiselect question rather than a 2-D permission
// tier grid — RoleMatrix itself is untouched and stays in use at /roles
// (role x feature) and ApproveRequestDialog.
//
// Reuses RoleMatrix's existing exported types (RoleMatrixApp,
// RoleMatrixCells) verbatim rather than redeclaring them, so
// buildRoleMatrixApps() and every existing data-fetch shape need zero
// changes.
//
// GROUPING IS NOT DECORATION HERE (Phase 3's own binding note): `roles.
// displayName` renders "Admin" for THREE different roles today
// (billing_admin, portal_admin, admin_admin) — an ungrouped flat
// list of checkboxes would render "Admin" three times with nothing telling
// them apart, reintroducing at the UI layer exactly the ambiguity this
// feature exists to remove. So this is a flat, one-checkbox-per-role list
// (no 2-D grid, no per-cell table structure) grouped under a <fieldset>
// per app — "flat question, not necessarily flat UI."
//
// ACCESSIBILITY: each checkbox gets a real, visible, htmlFor-associated
// <label> (Accessibility invariant: every form input has an associated
// label) carrying just the role's display name — legible on its own
// because it sits inside a <fieldset><legend>{app.label}</legend>. The
// checkbox's ACCESSIBLE NAME is additionally set via `aria-label` to
// "{app.label} — {level.label}" (same convention RoleMatrix's own Switch
// cells already use), so a screen-reader user hears "ADMIN — Admin"
// rather than bare "Admin" three times over — the exact disambiguation
// this feature exists to provide. aria-label takes precedence over the
// associated <label> in the accessible-name computation, by design: the
// <label> keeps native click-to-toggle + literal DOM association, the
// aria-label supplies the disambiguated name screen readers actually
// announce.

export interface RoleMultiSelectProps {
  /** One fieldset per app — reused verbatim from RoleMatrix's own prop. */
  apps: RoleMatrixApp[];
  /** appId -> levelId -> boolean — reused verbatim from RoleMatrix's own prop. */
  cells: RoleMatrixCells;
  onToggle: (appId: string, levelId: string, next: boolean) => void | Promise<void>;
  /** True for the viewer's own row — renders read-only, never hidden. */
  disabled?: boolean;
  /** `${appId}:${levelId}` keys currently mid-flight. */
  pending?: Set<string>;
  /**
   * Per-cell PERMANENT disable, keyed `${appId}:${levelId}` — same
   * convention as RoleMatrix's own `disabledCells` prop (a direct
   * key -> reason map, not a nested object).
   */
  disabledCells?: Record<string, string>;
  /**
   * Per-cell inline error, keyed `${appId}:${levelId}`, rendered directly
   * under the checkbox it belongs to (UX-PATTERNS.md § 6 — validation
   * feedback belongs inline, next to the form, never toast-only). Cleared
   * by the caller on the next toggle of that same cell.
   */
  cellErrors?: Record<string, string>;
  className?: string;
}

export function RoleMultiSelect({
  apps,
  cells,
  onToggle,
  disabled,
  pending,
  disabledCells,
  cellErrors,
  className,
}: RoleMultiSelectProps) {
  const idPrefix = React.useId();

  if (apps.length === 0) {
    return <p className="text-sm text-muted-foreground">No role namespaces to show yet.</p>;
  }

  return (
    <div className={cn("space-y-5", className)}>
      {apps.map((app) => (
        <fieldset key={app.id} className="rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium">{app.label}</legend>
          <div className="mt-1 space-y-2">
            {app.levels.map((level) => {
              const key = `${app.id}:${level.id}`;
              const checked = Boolean(cells[app.id]?.[level.id]);
              const disabledReason = disabledCells?.[key];
              const isProtected = disabledReason != null;
              const isPending = !isProtected && (pending?.has(key) ?? false);
              const error = cellErrors?.[key];
              const inputId = `${idPrefix}-${key}`;
              const errorId = error ? `${inputId}-error` : undefined;
              const reasonId = disabledReason ? `${inputId}-reason` : undefined;

              return (
                <div key={level.id}>
                  {/* FIXED 2026-09-10 (Phase 5 FAIL — touch target). The row
                      used to be a plain <div> wrapping a 16x16 Checkbox and a
                      separate <label>: `min-h-11` gave the DIV a real 44px
                      height, but `items-center` does not stretch flex
                      children, so the checkbox/label stayed their own
                      intrinsic size, vertically centered — only that small
                      centered band was actually clickable, empirically
                      confirmed by qa's click probe (a click 3px from the
                      row's top toggled nothing).
                      The fix: the ROW ITSELF is now the <label> (not a <div>
                      containing one). <label> is a native labelable-control
                      forwarder for its labelable descendants — button is a
                      labelable element (HTML Standard) — so a click ANYWHERE
                      in this label's box, including the padding between the
                      checkbox and the row's edges, activates the Checkbox
                      button exactly once (the browser's own label-activation
                      algorithm skips re-forwarding when the click's target
                      IS the control, which is what prevents a double
                      toggle) — verified by the click-based regression test
                      added alongside this fix, not merely reasoned about. */}
                  <label
                    htmlFor={inputId}
                    className={cn(
                      "flex min-h-11 items-center gap-2 text-sm",
                      disabled || isProtected || isPending
                        ? "cursor-not-allowed"
                        : "cursor-pointer",
                    )}
                  >
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      disabled={disabled || isProtected || isPending}
                      aria-label={`${app.label} — ${level.label}`}
                      aria-describedby={[errorId, reasonId].filter(Boolean).join(" ") || undefined}
                      onCheckedChange={(next) => onToggle(app.id, level.id, next === true)}
                    />
                    {level.label}
                  </label>
                  {isProtected && (
                    <p id={reasonId} className="ml-6 text-xs text-muted-foreground">
                      {disabledReason}
                    </p>
                  )}
                  {error && (
                    <p
                      id={errorId}
                      role="alert"
                      className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground"
                    >
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
