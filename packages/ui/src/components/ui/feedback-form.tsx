"use client";

// Promoted from apps/portal/src/components/shared/feedback-form.tsx on
// 2026-09-06 (Increment 2 of the cross-app feedback umbrella,
// apps/portal/docs/work-log/2026-09-06-cross-app-feedback.md). a predecessor app and
// the admin app gain the same form in Increments 3/4.
//
// Two Portal-local imports became props, which is the whole reason this needed
// more than a file move: the component used to import Portal's own
// `submitFeedback` server action and Portal's `APP_VERSION` directly, neither
// of which exists in the other two apps. Per UX-PATTERNS.md §1, capability
// differences use prop-gated slots rather than forks.
//
// TEACHING NOTE: to gate this form behind a feature flag, add:
//   if (!flagEnabled) return null;
// where flagEnabled is passed as a prop from the server component, e.g.:
//   const flagEnabled = await isFlagEnabled('feedback.v1');
// and pass it as a prop: <FeedbackForm flagEnabled={flagEnabled} />

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "./button";
import type { ActionResult } from "../../types/actions";

type Category = "suggestion" | "bug" | "other" | "";

/** Exactly what the form collects — each app's own action receives this. */
export interface FeedbackFormValues {
  body: string;
  category: string | null;
  contextPath: string | null;
  appVersion: string | null;
  tzOffsetMinutes: number | null;
}

export interface FeedbackFormProps {
  /**
   * The consuming app's own `submitFeedback` server action.
   *
   * Passed in rather than imported because WHERE the row is written — and what
   * `app` value it is scoped to — is app-owned. Portal's action sets
   * `app: "portal"`; one predecessor app's and Admin's set their own.
   */
  onSubmit: (values: FeedbackFormValues) => Promise<ActionResult<{ id: string }>>;

  /**
   * The app's own version string, attached to bug reports only.
   *
   * Optional: a predecessor app and the admin app have no `src/lib/version.ts`, and
   * inventing one would put a fake version in front of whoever triages the
   * report. When absent the version line is omitted and `appVersion` submits as
   * `null`, which the column permits.
   */
  appVersion?: string;

  /** Called after a successful submission (e.g. to close a Dialog wrapper). */
  onSuccess?: () => void;
}

export function FeedbackForm({ onSubmit, appVersion, onSuccess }: FeedbackFormProps) {
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("");
  const [isPending, startTransition] = useTransition();

  const trimmedLength = body.trim().length;
  const isSubmitDisabled = trimmedLength === 0 || isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitDisabled) return;

    // Capture TZ offset at submit time — not at mount — to reflect current offset.
    const tzOffsetMinutes = new Date().getTimezoneOffset();
    // Capture contextPath at submit time for bug reports.
    const contextPath =
      category === "bug" && typeof window !== "undefined"
        ? window.location.pathname
        : null;

    startTransition(async () => {
      const result = await onSubmit({
        body,
        category: category === "" ? null : category,
        contextPath,
        appVersion: category === "bug" ? (appVersion ?? null) : null,
        tzOffsetMinutes,
      });

      if (result.ok) {
        toast.success("Thanks — we read every one.");
        setBody("");
        setCategory("");
        onSuccess?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      {/* Category */}
      <div>
        <label
          htmlFor="feedback-category"
          className="block text-sm font-medium"
        >
          Category{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        {/* "none" sentinel (empty string maps to null in the action) per UI-STANDARDS.md */}
        <select
          id="feedback-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          disabled={isPending}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
        >
          <option value="">No preference</option>
          <option value="suggestion">Suggestion</option>
          <option value="bug">Bug report</option>
          <option value="other">General feedback</option>
        </select>
      </div>

      {/* Bug context — auto-captured, read-only */}
      {category === "bug" && (
        <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <div>
            Page:{" "}
            {typeof window !== "undefined" ? window.location.pathname : ""}
          </div>
          {/* Omitted entirely when the app supplies no version — better than
              showing a placeholder that reads as real in triage. */}
          {appVersion && <div>Version: {appVersion}</div>}
        </div>
      )}

      {/* Body */}
      <div>
        <label htmlFor="feedback-body" className="block text-sm font-medium">
          Message
        </label>
        <textarea
          id="feedback-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="What's on your mind?"
          disabled={isPending}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
        />
        {/* Character counter */}
        <span
          className={`mt-0.5 block text-right text-xs ${
            body.length > 1900
              ? "text-orange-600 dark:text-orange-400"
              : "text-muted-foreground"
          }`}
        >
          {body.length}/2000
        </span>
      </div>

      {/* Actions — stacked on mobile, row on sm+ per Phase 3 spec */}
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <Button
          type="submit"
          disabled={isSubmitDisabled}
          className="rounded-md bg-foreground text-background hover:opacity-90 active:opacity-75"
        >
          {isPending ? "Sending…" : "Send feedback"}
        </Button>
      </div>
    </form>
  );
}
