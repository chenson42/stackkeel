"use client"

import * as React from "react"
import { Switch } from "./switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"
import { cn } from "../../lib/utils"

// New packages/ui primitive (admin app, Increment 2 of
// 2026-09-04-identity-access-nav-consolidation, DECISION-054/055). A
// person x app x level permission grid — Phase 1's own finding that
// nothing like this exists in any predecessor app today (both use a
// flat single-role dropdown), and Phase 2's binding condition that it be
// built generic from day one: never hardcoded to today's three apps or
// today's tier set. `levels` nests INSIDE each `apps[]` entry (not two flat
// top-level arrays) specifically so an app with a single tier (the platform
// Admin's own self-governance, directive point 11) and an app with three
// tiers (the predecessor apps) render in the SAME grid without a second
// special-case mechanism (DECISION-055 point 2).
//
// `levels[].id` / `apps[].id` are caller-defined strings — the concrete
// the admin app consumer passes each level's real `roles.id` (a uuid) as
// `id`, since a role grant/revoke needs the actual role id to call its
// server action, not a semantic "read"/"write"/"admin" label. `cells` and
// `onToggle` are keyed by these same ids, so this component never has to
// know what a "role" or a "grant" means to its caller.

export interface RoleMatrixLevel {
  id: string;
  label: string;
}

export interface RoleMatrixApp {
  id: string;
  label: string;
  /** This app's own available tiers, in column order. */
  levels: RoleMatrixLevel[];
}

export type RoleMatrixCells = Record<string /* appId */, Record<string /* levelId */, boolean>>;

export interface RoleMatrixProps {
  apps: RoleMatrixApp[];
  cells: RoleMatrixCells;
  onToggle: (appId: string, levelId: string, next: boolean) => void | Promise<void>;
  /** True for the viewer's own row — self-target guard renders read-only,
   * never hidden, so the UI doesn't invite an attempt the server action
   * would reject anyway. */
  disabled?: boolean;
  /** `${appId}:${levelId}` keys currently mid-flight, for optimistic-UI
   * dimming while a toggle's server action is in progress. */
  pending?: Set<string>;
  className?: string;
  /** NEW (2026-09-09-roles-permissions-ux Phase 3 § 1). Row-header column
   * label — default "App", unchanged from every existing call site. Lets a
   * consumer reuse this same component with a different row semantic (e.g.
   * "Permission" for a role x feature grid) without a hardcoded string. */
  rowHeaderLabel?: string;
  /**
   * NEW (2026-09-09-roles-permissions-ux Phase 3 § 1). Per-cell PERMANENT
   * disable, keyed `${appId}:${levelId}` (same convention as `pending`) —
   * the value is the reason shown in a Tooltip and folded into the cell's
   * accessible name. Distinct from `disabled` (whole-matrix, e.g. "this is
   * your own row") and `pending` (transient, mid-flight): a `disabledCells`
   * entry never clears itself and is checked BEFORE `pending`, so a
   * protected cell is never simultaneously shown as "in flight." The
   * underlying control renders natively `disabled` (so it can never be
   * toggled or included in Tab order), wrapped in a separately focusable,
   * Tooltip-triggering span that carries the full accessible name + reason
   * — a screen reader or keyboard-only user reaches the reason the same way
   * a sighted mouse user does, not only via hover.
   */
  disabledCells?: Record<string, string>;
}

/**
 * Renders as ONE real <table> throughout — semantic markup stays a table
 * at every width, per this monorepo's accessibility invariant ("tables
 * that act like tables stay <table> — no div grids"). At <640px the SAME
 * table reflows into a stacked card-per-app layout via CSS alone (Tailwind
 * `max-sm:` variants: the header hides, each row becomes a bordered block,
 * each cell becomes a labeled flex row) rather than switching to a
 * horizontal-scroll grid — Phase 1 flagged the matrix as the UI shape
 * hardest to make work at 360px, and Phase 3's Edge Cases named the
 * stacked-card collapse as the right implementation approach. Every toggle
 * carries its own aria-label (app + level) since the column header is
 * visually hidden at that width.
 */
export function RoleMatrix({
  apps,
  cells,
  onToggle,
  disabled,
  pending,
  className,
  rowHeaderLabel,
  disabledCells,
}: RoleMatrixProps) {
  // Column header set = union of every level LABEL across all apps[], in
  // first-seen order. An app that doesn't declare a given tier renders a
  // disabled dash in that column, not a checkbox.
  //
  // Deduplicated by label, not by id — corrected 2026-09-06 after Chris asked
  // "why 3 admin roles?". Level ids are per-app role names
  // (`billing_admin`, `portal_admin`, `admin_admin`), so they are
  // always distinct and nothing ever collapsed: every app contributed its own
  // columns and the table rendered THREE separate headings all reading
  // "Admin", one per app, each with a single toggle and two dashes.
  //
  // That defeats the grid this component exists to be — the header note above
  // says apps with different tier counts should render in the SAME grid, which
  // only happens if shared tiers share a column. Collapsing by label gives
  // Admin / Write / Read / Member, and an app's Admin toggle now sits under the
  // one "Admin" heading.
  //
  // Cells and onToggle still key on each app's OWN level id, resolved
  // per-row below — the callback contract is unchanged.
  const levelColumns: RoleMatrixLevel[] = [];
  const seenLabels = new Set<string>();
  for (const app of apps) {
    for (const level of app.levels) {
      if (!seenLabels.has(level.label)) {
        seenLabels.add(level.label);
        levelColumns.push(level);
      }
    }
  }

  return (
    <table className={cn("w-full border-collapse text-sm max-sm:block", className)}>
      <thead className="max-sm:hidden">
        <tr className="border-b border-border">
          <th className="w-40 py-2 pr-2 text-left align-middle font-medium text-muted-foreground">
            {rowHeaderLabel ?? "App"}
          </th>
          {levelColumns.map((level) => (
            <th
              key={level.label}
              className="px-2 py-2 text-center align-middle font-medium text-muted-foreground"
            >
              {level.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="max-sm:block max-sm:space-y-3">
        {apps.map((app) => (
          <tr
            key={app.id}
            className="border-b border-border last:border-0 max-sm:block max-sm:rounded-lg max-sm:border max-sm:border-border max-sm:p-3"
          >
            <td className="py-3 pr-2 align-middle font-medium max-sm:block max-sm:p-0 max-sm:pb-2">
              {app.label}
            </td>
            {levelColumns.map((column) => {
              // Resolve THIS app's own level for the column, matched by label.
              // The id differs per app (`billing_admin` vs `portal_admin`),
              // and it is the id — never the column's — that keys `cells` and
              // is handed to `onToggle`.
              const level = app.levels.find((l) => l.label === column.label);
              const hasLevel = level != null;
              const levelId = level?.id ?? column.id;
              const key = `${app.id}:${levelId}`;
              const checked = Boolean(cells[app.id]?.[levelId]);
              // disabledCells is checked BEFORE pending (see the prop's own
              // doc comment): a permanently-protected cell never also shows
              // the transient "in flight" dimming.
              const disabledReason = disabledCells?.[key];
              const isProtected = disabledReason != null;
              const isPending = !isProtected && (pending?.has(key) ?? false);
              const accessibleName = isProtected
                ? `${app.label} — ${column.label}. ${disabledReason}`
                : `${app.label} — ${column.label}`;
              return (
                <td
                  key={column.label}
                  className="px-2 py-3 text-center align-middle max-sm:flex max-sm:items-center max-sm:justify-between max-sm:p-0 max-sm:py-1.5"
                >
                  <span className="hidden text-xs text-muted-foreground max-sm:inline">
                    {column.label}
                  </span>
                  {hasLevel ? (
                    isProtected ? (
                      // The interactive Switch renders natively `disabled`
                      // (can't be toggled, drops out of Tab order on its
                      // own), so the outer span — not the Switch — is the
                      // real focusable/hoverable element: it carries
                      // role="switch" + aria-checked + aria-disabled + the
                      // full reason as its own accessible name, and is what
                      // TooltipTrigger attaches to. That means a
                      // keyboard-only or screen-reader user reaches the
                      // reason the identical way a sighted mouse user does
                      // (Tab + focus, not hover-only) — the Switch
                      // underneath is aria-hidden, purely decorative.
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            tabIndex={0}
                            role="switch"
                            aria-checked={checked}
                            aria-disabled="true"
                            aria-label={accessibleName}
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <Switch
                              size="lg"
                              checked={checked}
                              disabled
                              tabIndex={-1}
                              aria-hidden="true"
                              className="relative opacity-70"
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{disabledReason}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="inline-flex min-h-11 min-w-11 items-center justify-center">
                        <Switch
                          size="lg"
                          checked={checked}
                          disabled={disabled || isPending}
                          aria-label={accessibleName}
                          onCheckedChange={(next) => onToggle(app.id, levelId, next)}
                          // `lg` track is 44x24px — already >=44px wide but
                          // short of the 44px minimum touch target on the
                          // vertical axis. A wrapping span alone only
                          // centers the visual thumb; it doesn't enlarge the
                          // <button>'s own hit-testing box. This ::before
                          // pseudo-element genuinely does: it's rendered
                          // inside the button's box, so a tap anywhere in
                          // its (invisible) 44px-tall region still counts as
                          // a click on the switch.
                          className={cn(
                            "relative before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']",
                            isPending && "opacity-50",
                          )}
                        />
                      </span>
                    )
                  ) : (
                    <span aria-hidden="true" className="text-muted-foreground">
                      —
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
        {apps.length === 0 && (
          <tr>
            <td colSpan={levelColumns.length + 1} className="py-6 text-center text-muted-foreground">
              No role namespaces to show yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
