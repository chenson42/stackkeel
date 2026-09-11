"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@repo/ui";
import { resendInviteAction } from "../actions";

export function ResendInviteButton({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await resendInviteAction({ userId });
      if (result.ok) {
        toast.success("Invite resent.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className="min-h-11"
    >
      {isPending ? "Resending…" : "Resend invite"}
    </Button>
  );
}
