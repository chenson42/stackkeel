"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@repo/ui";
import { requestEmailChange, cancelEmailChange } from "./actions";

interface EmailFormProps {
  currentEmail: string;
  pendingEmail: string | null;
}

export function EmailForm({ currentEmail, pendingEmail }: EmailFormProps) {
  const [newEmail, setNewEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await requestEmailChange({ newEmail });
    setPending(false);
    if (result.ok) {
      setNewEmail("");
      toast.success("Check your new inbox for a verification link.");
    } else {
      toast.error(result.error);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    const result = await cancelEmailChange();
    setCancelling(false);
    if (result.ok) {
      toast.success("Pending email change cancelled.");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div>
        <p className="text-sm font-medium">Current email</p>
        <p className="mt-1 text-sm text-muted-foreground">{currentEmail}</p>
      </div>

      {pendingEmail && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span className="font-medium">Pending change</span> to{" "}
          <span className="font-mono">{pendingEmail}</span> — check that inbox
          for a verification link.{" "}
          <Button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            variant="link"
            className="ml-1 h-auto p-0 align-baseline font-normal text-foreground underline underline-offset-2 hover:text-foreground hover:no-underline"
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="new-email" className="block text-sm font-medium">
            New email address
          </label>
          <input
            id="new-email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="you@example.com"
          />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground text-background hover:bg-foreground/90"
        >
          {pending ? "Sending…" : "Request email change"}
        </Button>
      </form>
    </div>
  );
}
