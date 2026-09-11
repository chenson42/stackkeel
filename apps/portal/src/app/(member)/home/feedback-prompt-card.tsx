"use client";

// TEACHING NOTE: The daily prompt card is always shown to authenticated users
// who haven't snoozed, submitted, or opted out today. To gate it behind a
// feature flag, pass a prop from the server component:
//   const flagEnabled = await isFlagEnabled('feedback.v1');
//   {flagEnabled && shouldShow && <FeedbackPromptCard />}
// This demonstrates the pattern without shipping an always-on flag.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui";
import { FeedbackForm } from "@repo/ui";
import { submitFeedback } from "@/app/(member)/feedback/actions";
import { APP_VERSION } from "@/lib/version";
import {
  snoozeFeedbackPrompt,
  setFeedbackOptOut,
} from "@/app/(member)/feedback/actions";

export function FeedbackPromptCard() {
  const router = useRouter();

  // Capture TZ offset at mount — used for snooze action.
  const [tzOffset] = useState(() => new Date().getTimezoneOffset());
  const [visible, setVisible] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [optOutAlertOpen, setOptOutAlertOpen] = useState(false);
  const [snoozePending, setSnoozePending] = useState(false);
  const [optOutPending, setOptOutPending] = useState(false);

  if (!visible) return null;

  async function handleSnooze() {
    setSnoozePending(true);
    const result = await snoozeFeedbackPrompt(tzOffset);
    setSnoozePending(false);
    if (result.ok) {
      setVisible(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Something went wrong — try again.");
    }
  }

  async function handleOptOut() {
    setOptOutAlertOpen(false);
    setOptOutPending(true);
    const result = await setFeedbackOptOut(true);
    setOptOutPending(false);
    if (result.ok) {
      setVisible(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Something went wrong — try again.");
    }
  }

  return (
    <div className="rounded-lg border border-border p-5">
      <h2 className="text-base font-medium">How are we doing?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Have a suggestion or spotted a bug? We&apos;d love to hear it.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        {/* "Share feedback" → Dialog with FeedbackForm */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              className="rounded-md bg-foreground text-background hover:opacity-90 active:opacity-75"
            >
              Share feedback
            </Button>
          </DialogTrigger>
          <DialogContent
            showCloseButton={false}
            className="max-h-[90dvh] overflow-y-auto"
          >
            <DialogTitle>Share feedback</DialogTitle>
            <DialogDescription className="mt-1">
              We read every submission. Your feedback shapes what we build
              next.
            </DialogDescription>
            <FeedbackForm
              onSubmit={submitFeedback}
              appVersion={APP_VERSION}
              onSuccess={() => {
                setDialogOpen(false);
                setVisible(false);
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>

        {/* "Not today" — snooze until tomorrow */}
        <Button
          type="button"
          onClick={handleSnooze}
          disabled={snoozePending || optOutPending}
          variant="outline"
          className="rounded-md hover:bg-muted hover:text-foreground active:bg-muted/70"
        >
          {snoozePending ? "Saving…" : "Not today"}
        </Button>

        {/* "Stop asking" → AlertDialog confirm before opt-out */}
        <AlertDialog open={optOutAlertOpen} onOpenChange={setOptOutAlertOpen}>
          <Button
            type="button"
            onClick={() => setOptOutAlertOpen(true)}
            disabled={snoozePending || optOutPending}
            variant="link"
            className="h-auto p-0 font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground hover:underline"
          >
            Stop asking
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Stop daily prompts?</AlertDialogTitle>
              <AlertDialogDescription>
                You can re-enable the daily prompt any time from Account
                settings &rarr; Send feedback.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="hover:bg-muted hover:text-foreground">
                Never mind
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleOptOut}
                disabled={optOutPending}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                Yes, stop asking
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
