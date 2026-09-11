"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  Button,
} from "@repo/ui";
import { resetMfaAction } from "./actions";

// 2FA atomic-convergence Increment 3 (2026-09-08) — mirrors
// RejectRequestDialog's own AlertDialog shape (../../requests/
// reject-request-dialog.tsx), this app's established destructive-confirm
// pattern. Only rendered by page.tsx when the target has an active
// userTotp row — nothing to reset otherwise.
export function ResetMfaButton({
  userId,
  isSelf,
}: {
  userId: string;
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleReset() {
    startTransition(async () => {
      const result = await resetMfaAction({ targetUserId: userId });
      if (result.ok) {
        toast.success(
          isSelf
            ? "Your MFA has been reset. You'll be asked to re-enroll on your next sign-in."
            : "MFA reset. They'll be asked to re-enroll on their next sign-in.",
        );
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          Reset MFA
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset two-factor authentication?</AlertDialogTitle>
          <AlertDialogDescription>
            {isSelf
              ? "This deletes your own authenticator enrollment and every recovery code you were issued. You'll be required to re-enroll before you can reach any page on your next sign-in."
              : "This deletes their authenticator enrollment and every recovery code they were issued. They'll be required to re-enroll before they can reach any page on their next sign-in. Use this when someone has lost their authenticator and their recovery codes."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReset}
            variant="destructive"
            disabled={isPending}
            className="min-h-11"
          >
            {isPending ? "Resetting…" : "Reset MFA"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
