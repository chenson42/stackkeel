"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@repo/ui";
import { setFeedbackOptOut } from "@/app/(member)/feedback/actions";

interface FeedbackOptOutToggleProps {
  optedOut: boolean;
}

export function FeedbackOptOutToggle({ optedOut }: FeedbackOptOutToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localOptedOut, setLocalOptedOut] = useState(optedOut);

  function handleReEnable() {
    startTransition(async () => {
      const result = await setFeedbackOptOut(false);
      if (result.ok) {
        setLocalOptedOut(false);
        toast.success("Daily prompt re-enabled.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong — try again.");
      }
    });
  }

  if (localOptedOut) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <p className="text-sm text-muted-foreground">
          The daily home page prompt is paused.
        </p>
        <Button
          type="button"
          onClick={handleReEnable}
          disabled={isPending}
          variant="outline"
          size="sm"
          className="self-start rounded-md hover:bg-muted hover:text-foreground active:bg-muted/70"
        >
          {isPending ? "Saving…" : "Re-enable prompt"}
        </Button>
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      The daily prompt appears once per day on your home page.
    </p>
  );
}
