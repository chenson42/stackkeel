"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Label } from "@repo/ui";
import type {
  ChangeClass,
  TicketArea,
  TicketPriority,
  TicketStatus,
} from "@repo/db";
// VALUES from the labels file, TYPES from @repo/db — server-only poisoning;
// see @/lib/tickets-labels.ts's header.
import {
  CHANGE_CLASSES,
  CHANGE_CLASS_LABELS,
  TICKET_AREAS,
  TICKET_AREA_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/tickets-labels";
import {
  assignTicketAction,
  reclassifyTicketAction,
  setTicketAreaAction,
  setTicketPriorityAction,
  setTicketStatusAction,
} from "../actions";
import type { ActionResult } from "@/types/actions";

/**
 * Mirrors packages/db's TICKET_TRANSITIONS (the real authority — server-side
 * validateTicketTransition). A stale mirror here at worst offers-then-
 * rejects a transition, never a security gap (same accepted duplication as
 * ../feedback/feedback-status-control.tsx documents).
 */
const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  new: ["triaged", "in_progress", "resolved", "declined"],
  triaged: ["in_progress", "resolved", "declined"],
  in_progress: ["resolved", "declined"],
  resolved: ["in_progress"],
  declined: ["in_progress"],
};

const SELECT_CLASSES =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm " +
  "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

function ControlSelect<T extends string>({
  id,
  label,
  value,
  options,
  optionLabels,
  onChange,
  keepCurrent = true,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  optionLabels: Record<T, string>;
  onChange: (next: T) => Promise<ActionResult>;
  /** Include the current value as a selectable no-op option. */
  keepCurrent?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState<T>(value);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={SELECT_CLASSES}
        value={current}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as T;
          const previous = current;
          setCurrent(next);
          startTransition(async () => {
            const result = await onChange(next);
            if (result.ok) {
              toast.success(`${label} updated.`);
              router.refresh();
            } else {
              setCurrent(previous);
              toast.error(result.error);
            }
          });
        }}
      >
        {keepCurrent && !options.includes(current) && (
          <option value={current}>{optionLabels[current] ?? current}</option>
        )}
        {options.map((o) => (
          <option key={o} value={o}>
            {optionLabels[o] ?? o}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface OperatorOption {
  id: string;
  label: string;
}

export function TicketControls({
  ticketId,
  status,
  changeClass,
  area,
  priority,
  assigneeUserId,
  operators,
}: {
  ticketId: string;
  status: TicketStatus;
  changeClass: ChangeClass;
  area: TicketArea;
  priority: TicketPriority;
  assigneeUserId: string | null;
  operators: OperatorOption[];
}) {
  const router = useRouter();
  const [assignPending, startAssign] = useTransition();
  const [assignee, setAssignee] = useState(assigneeUserId ?? "");

  // Status offers current + legal targets only.
  const statusOptions = [
    status,
    ...(VALID_TRANSITIONS[status] ?? []),
  ] as TicketStatus[];

  return (
    <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-5">
      <ControlSelect
        id="ticket-status"
        label="Status"
        value={status}
        options={statusOptions}
        optionLabels={TICKET_STATUS_LABELS}
        onChange={(next) =>
          next === status
            ? Promise.resolve({ ok: true as const })
            : setTicketStatusAction(ticketId, next)
        }
      />
      <div className="space-y-1.5">
        <Label htmlFor="ticket-assignee">Assignee</Label>
        <select
          id="ticket-assignee"
          className={SELECT_CLASSES}
          value={assignee}
          disabled={assignPending}
          onChange={(e) => {
            const next = e.target.value;
            const previous = assignee;
            setAssignee(next);
            startAssign(async () => {
              const result = await assignTicketAction(ticketId, next || null);
              if (result.ok) {
                toast.success("Assignee updated.");
                router.refresh();
              } else {
                setAssignee(previous);
                toast.error(result.error);
              }
            });
          }}
        >
          <option value="">Unassigned</option>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <ControlSelect
        id="ticket-class"
        label="Category"
        value={changeClass}
        options={CHANGE_CLASSES}
        optionLabels={CHANGE_CLASS_LABELS}
        onChange={(next) => reclassifyTicketAction(ticketId, next)}
      />
      <ControlSelect
        id="ticket-area"
        label="Area"
        value={area}
        options={TICKET_AREAS}
        optionLabels={TICKET_AREA_LABELS}
        onChange={(next) => setTicketAreaAction(ticketId, next)}
      />
      <ControlSelect
        id="ticket-priority"
        label="Priority"
        value={priority}
        options={TICKET_PRIORITIES}
        optionLabels={TICKET_PRIORITY_LABELS}
        onChange={(next) => setTicketPriorityAction(ticketId, next)}
      />
    </div>
  );
}

