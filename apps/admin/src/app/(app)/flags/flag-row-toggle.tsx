"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Switch,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@repo/ui";
import { setFlagAction } from "./actions";

/**
 * One flag row's enable/disable control (2026-09-05-admin-menu-structure).
 *
 * Platform-wide flags (`app === null`) require an explicit confirm step —
 * the design doc's own Edge Cases section: "a mis-click here is not
 * cosmetic — it can flip 2FA enforcement off for every app." Scoped flags
 * (app set to one of a predecessor app/portal/admin) are lower-stakes and toggle
 * immediately, matching the design's "scoped flags are lower-stakes" call.
 *
 * shadcn AlertDialog, never a native confirm() — CLAUDE.md Workflow Rule 2.
 */
export function FlagRowToggle({
  flagKey,
  app,
  initialEnabled,
}: {
  flagKey: string;
  app: string | null;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function commit(next: boolean) {
    startTransition(async () => {
      const result = await setFlagAction({ key: flagKey, enabled: next });
      if (result.ok) {
        const finalEnabled = result.data?.enabled ?? next;
        setEnabled(finalEnabled);
        toast.success(`${flagKey} ${finalEnabled ? "enabled" : "disabled"}.`);
      } else {
        toast.error(result.error ?? "Unable to update this flag — please try again.");
      }
    });
  }

  function handleCheckedChange(next: boolean) {
    if (app === null) {
      // Platform-wide — confirm before committing. The switch itself stays
      // uncontrolled-looking to the user until they confirm; we don't
      // optimistically flip `enabled` here.
      setConfirmOpen(true);
      return;
    }
    commit(next);
  }

  return (
    <>
      <Switch
        checked={enabled}
        onCheckedChange={handleCheckedChange}
        disabled={isPending}
        aria-label={`Toggle ${flagKey}`}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {enabled ? "Disable" : "Enable"} &ldquo;{flagKey}&rdquo; for every app?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This flag is platform-wide (no app scope) — {enabled ? "disabling" : "enabling"} it
              changes behavior for every app at once, immediately. This
              is logged to the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => commit(!enabled)}
              disabled={isPending}
              className="min-h-11"
            >
              {isPending ? "Saving…" : enabled ? "Disable for everyone" : "Enable for everyone"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
