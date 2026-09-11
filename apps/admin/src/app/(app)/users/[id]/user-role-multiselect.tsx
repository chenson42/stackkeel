"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RoleMultiSelect, type RoleMatrixApp, type RoleMatrixCells } from "@repo/ui";
import { setRoleGrantAction } from "./actions";

/**
 * Client wrapper around the generic RoleMultiSelect primitive for THIS
 * page's job — replaces UserRoleMatrix (2026-09-10-app-scoped-roles-and-
 * multiselect, Increment 2). Same optimistic-toggle/pending/revert shell as
 * the matrix it replaces: one checkbox = one immediate setRoleGrantAction
 * call (still "one audit event per role actually changed" — batching a
 * Save across many checkboxes would break that), optimistic-updates the
 * toggled cell immediately, reverts it if the server action rejects
 * (self-target, last-admin, cross-namespace, or persona conflict), and
 * dims the cell via `pending` while its own call is in flight.
 *
 * setRoleGrantAction's contract is reused verbatim — zero server-side
 * changes for this increment. The one addition over UserRoleMatrix: a
 * rejected result now ALSO renders inline via `cellErrors` (Phase 2 § D's
 * ruling — "check-then-immediately-revert, server error surfaced inline,"
 * not auto-swap), next to the specific checkbox that was reverted, per
 * UX-PATTERNS.md § 6 ("validation feedback belongs inline, next to the
 * form, never toast-only"). The toast stays for the SUCCESS case only —
 * it was never the thing UX-PATTERNS § 6 objects to.
 */
export function UserRoleMultiSelect({
  targetUserId,
  apps,
  initialCells,
  disabled,
}: {
  targetUserId: string;
  apps: RoleMatrixApp[];
  initialCells: RoleMatrixCells;
  disabled?: boolean;
}) {
  const [cells, setCells] = useState<RoleMatrixCells>(initialCells);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  function setCell(appId: string, levelId: string, value: boolean) {
    setCells((prev) => ({ ...prev, [appId]: { ...prev[appId], [levelId]: value } }));
  }

  function clearError(key: string) {
    setCellErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleToggle(appId: string, levelId: string, next: boolean) {
    const key = `${appId}:${levelId}`;
    setCell(appId, levelId, next);
    clearError(key); // clear any stale error the moment the admin retries
    setPending((prev) => new Set(prev).add(key));

    startTransition(async () => {
      const result = await setRoleGrantAction({ targetUserId, roleId: levelId, granted: next });

      setPending((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });

      if (!result.ok) {
        setCell(appId, levelId, !next); // revert the checkbox
        setCellErrors((prev) => ({ ...prev, [key]: result.error })); // inline, not toast-only
        return;
      }
      toast.success(next ? "Role granted." : "Role revoked.");
    });
  }

  return (
    <RoleMultiSelect
      apps={apps}
      cells={cells}
      onToggle={handleToggle}
      disabled={disabled}
      pending={pending}
      cellErrors={cellErrors}
    />
  );
}
