"use client";

import { useState, useTransition } from "react";
import { RoleMatrix, type RoleMatrixApp, type RoleMatrixCells } from "@repo/ui";
import { setRoleFeatureAction } from "./actions";

/**
 * Client wrapper around the generic RoleMatrix primitive for the /roles
 * page's own job: one toggle = one immediate setRoleFeatureAction call
 * (per-toggle-immediate, matching users/[id]'s UserRoleMatrix precedent —
 * 2026-09-09-roles-permissions-ux Phase 2 § 2 / Phase 3 § 2). Rows are
 * features (this category group's own slice), columns are roles for the
 * app tab this group renders under.
 *
 * Deliberately does NOT toast on failure — this pass's own task brief:
 * "Show pending state per cell; surface failures inline," and UX-PATTERNS
 * § 6 ("Validation feedback belongs inline, next to the form — not in a
 * toast"). UserRoleMatrix's own toast-on-failure precedent is not followed
 * here; this is a considered deviation, not an oversight.
 */
export function RoleFeatureMatrix({
  matrixApps,
  initialCells,
  disabledCells,
}: {
  matrixApps: RoleMatrixApp[];
  initialCells: RoleMatrixCells;
  disabledCells?: Record<string, string>;
}) {
  const [cells, setCells] = useState<RoleMatrixCells>(initialCells);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function setCell(appId: string, levelId: string, value: boolean) {
    setCells((prev) => ({ ...prev, [appId]: { ...prev[appId], [levelId]: value } }));
  }

  function handleToggle(appId: string, levelId: string, next: boolean) {
    const key = `${appId}:${levelId}`;
    setError(null);
    setCell(appId, levelId, next);
    setPending((prev) => new Set(prev).add(key));

    startTransition(async () => {
      const result = await setRoleFeatureAction({ roleId: levelId, featureKey: appId, granted: next });

      setPending((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });

      if (!result.ok) {
        setCell(appId, levelId, !next);
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground"
        >
          {error}
        </p>
      )}
      <RoleMatrix
        apps={matrixApps}
        cells={cells}
        onToggle={handleToggle}
        pending={pending}
        disabledCells={disabledCells}
        rowHeaderLabel="Permission"
      />
    </div>
  );
}
