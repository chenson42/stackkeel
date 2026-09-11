"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateFeedbackStatus } from "./actions";

// Mirrors packages/db's FEEDBACK_TRANSITIONS (the real source of truth —
// keep this literal in sync with it). NOT imported from @repo/db: that
// package pulls in Drizzle/Postgres driver code that must never enter a
// client bundle, so this small, independently-maintained mirror is an
// accepted, named duplication (umbrella Phase 3 Edge Cases & Risks) — the
// same tradeoff Portal's own original component already accepted. Server-
// side validation (validateFeedbackTransition, shared) is the actual
// authority; a stale mirror here would at worst offer-then-reject a
// transition, never a security gap.
const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  new: ["triaged", "declined"],
  triaged: ["done", "declined"],
  done: [],
  declined: [],
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  triaged: "Triaged",
  done: "Delivered",
  declined: "Declined",
};

interface FeedbackStatusControlProps {
  feedbackId: string;
  currentStatus: string;
}

export function FeedbackStatusControl({
  feedbackId,
  currentStatus,
}: FeedbackStatusControlProps) {
  const [status, setStatus] = useState(currentStatus);
  const [isPending, startTransition] = useTransition();

  const allowedTransitions = VALID_TRANSITIONS[status] ?? [];
  const isTerminal = allowedTransitions.length === 0;

  // Terminal states render a plain badge — no select to avoid confusing empty UI.
  if (isTerminal) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          status === "done"
            ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200"
            : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
        }`}
      >
        {STATUS_LABELS[status] ?? status}
      </span>
    );
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    if (!newStatus || newStatus === status) return;

    const previousStatus = status;
    // Optimistic update
    setStatus(newStatus);

    startTransition(async () => {
      const result = await updateFeedbackStatus(feedbackId, newStatus);
      if (!result.ok) {
        // Revert on failure
        setStatus(previousStatus);
        toast.error(result.error ?? "Status update failed.");
      }
    });
  }

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={isPending}
      aria-label="Update feedback status"
      className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50"
    >
      {/* Current status — always shown as selected */}
      <option value={status}>{STATUS_LABELS[status] ?? status}</option>
      {/* Legal forward transitions only */}
      {allowedTransitions.map((next) => (
        <option key={next} value={next}>
          {STATUS_LABELS[next] ?? next}
        </option>
      ))}
    </select>
  );
}
