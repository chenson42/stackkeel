"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Label } from "@repo/ui";
import { replyToTicketAsOperatorAction } from "../actions";

export function OperatorReplyForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await replyToTicketAsOperatorAction(ticketId, body);
      if (result.ok) {
        setBody("");
        toast.success("Reply sent — the submitter has been emailed.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} aria-label="Reply as operator">
      <div className="space-y-1.5">
        <Label htmlFor="operator-reply">Reply as operator</Label>
        <textarea
          id="operator-reply"
          className="border-input bg-background min-h-24 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          required
        />
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
