"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Input, Label } from "@repo/ui";
import type { ChangeClass, TicketArea, TicketPriority } from "@repo/db";
// VALUES from the labels file, TYPES from @repo/db — see tickets-labels.ts's
// header for why the arrays are re-declared rather than re-exported.
import {
  CHANGE_CLASSES,
  CHANGE_CLASS_LABELS,
  TICKET_AREAS,
  TICKET_AREA_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
} from "@/lib/tickets-labels";
import { fileTicketAction } from "./actions";

const SELECT_CLASSES =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm " +
  "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

export function FileTicketForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [changeClass, setChangeClass] = useState<ChangeClass>("bug");
  const [area, setArea] = useState<TicketArea>("account");
  const [priority, setPriority] = useState<TicketPriority>("normal");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await fileTicketAction({
        subject,
        body,
        changeClass,
        area,
        priority,
      });
      if (result.ok && result.data) {
        toast.success("Ticket filed — support has been notified.");
        router.push(`/support/${result.data.ticketId}?from=/support`);
      } else if (result.ok) {
        // Contract drift guard: ok without data shouldn't happen (the
        // action always returns the id) but must not crash the form.
        toast.success("Ticket filed.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-border p-4 sm:p-6"
      aria-label="File a support ticket"
    >
      <h2 className="text-base font-semibold">File a ticket</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ticket-category">Category</Label>
          <select
            id="ticket-category"
            className={SELECT_CLASSES}
            value={changeClass}
            onChange={(e) => setChangeClass(e.target.value as ChangeClass)}
          >
            {CHANGE_CLASSES.map((c) => (
              <option key={c} value={c}>
                {CHANGE_CLASS_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticket-area">Area</Label>
          <select
            id="ticket-area"
            className={SELECT_CLASSES}
            value={area}
            onChange={(e) => setArea(e.target.value as TicketArea)}
          >
            {TICKET_AREAS.map((a) => (
              <option key={a} value={a}>
                {TICKET_AREA_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticket-priority">Priority</Label>
          <select
            id="ticket-priority"
            className={SELECT_CLASSES}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
          >
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TICKET_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <Label htmlFor="ticket-subject">Subject</Label>
        <Input
          id="ticket-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          required
          placeholder="One line describing the issue"
        />
      </div>

      <div className="mt-4 space-y-1.5">
        <Label htmlFor="ticket-body">What happened?</Label>
        <textarea
          id="ticket-body"
          className="border-input bg-background min-h-28 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          required
          placeholder="Steps, what you expected, and what you saw instead."
        />
      </div>

      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Filing…" : "File ticket"}
        </Button>
      </div>
    </form>
  );
}
