"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { promoteFeedbackToTicketAction } from "../tickets/actions";

/**
 * Rendered only for rows still in 'new'/'triaged' with no
 * promoted_to_ticket_id, and only when the viewer holds admin.tickets
 * (the page passes canTickets) — the server action re-enforces both.
 */
export function PromoteToTicketButton({ feedbackId }: { feedbackId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          const result = await promoteFeedbackToTicketAction(feedbackId);
          if (result.ok && result.data) {
            toast.success("Promoted to a ticket.");
            router.push(`/tickets/${result.data.ticketId}`);
          } else if (result.ok) {
            toast.success("Promoted to a ticket.");
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      {pending ? "Promoting…" : "Promote to ticket"}
    </button>
  );
}
