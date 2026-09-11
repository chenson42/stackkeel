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
import { revokeDevice } from "./actions";

/** Confirm-then-revoke. Shared AlertDialog per Key Invariant 9 (no confirm()). */
export function RevokeDeviceButton({
  deviceId,
  deviceName,
}: {
  deviceId: string;
  deviceName: string | null;
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
            {deviceName ? `“${deviceName}”` : "This device"} will be signed out
            immediately and can only reconnect by pairing again. This cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await revokeDevice(deviceId);
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
