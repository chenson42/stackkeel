"use client";

import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from "@repo/ui";
import { toast } from "sonner";
import { revokeDeviceAsOperator } from "./actions";

/** Confirm-then-revoke (shared AlertDialog, Key Invariant 9). */
export function DeviceRevokeButton({
  deviceId,
  ownerEmail,
}: {
  deviceId: string;
  ownerEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this device?</AlertDialogTitle>
          <AlertDialogDescription>
            {ownerEmail ? `${ownerEmail}'s device` : "This device"} will be
            signed out immediately and must pair again to reconnect. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await revokeDeviceAsOperator(deviceId);
                if (result.ok) {
                  toast.success("Device revoked.");
                  setOpen(false);
                } else {
                  toast.error(result.error);
                }
              });
            }}
          >
            {pending ? "Revoking…" : "Revoke device"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
