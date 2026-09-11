"use client";

// Shared "My feedback" self-status view (Increment 5 of the cross-app
// feedback umbrella,
// apps/portal/docs/work-log/2026-09-06-feedback-status-view.md). A pure
// renderer: it is handed rows via `fetchItems`, never a user id, and has no
// way to ask for anyone else's — the IDOR boundary lives entirely in each
// app's own zero-argument getMyFeedback() wrapper, one layer below this
// component.
//
// Reuses two already-promoted primitives — no new date-formatting or
// app-labelling logic needed: AppBadge (app-badge.tsx) and FormattedDate
// (../shared/formatted-date.tsx).

import { useEffect, useState } from "react";
import { AppBadge, type AppBadgeApp } from "./app-badge";
import { FormattedDate } from "../shared/formatted-date";
import type { ActionResult } from "../../types/actions";

export interface MyFeedbackItem {
  id: string;
  /** Loosely typed on purpose — the DB column is `text`, not an enum, same
   *  as status below. The component falls back to the raw string for either
   *  field rather than throwing if a future 4th app or 5th status value
   *  shows up before this component is updated for it. */
  app: string;
  category: string | null;
  body: string;
  status: string;
  /** ISO 8601 — matches what each app's getMyFeedback() wrapper returns. */
  createdAt: string;
}

export interface MyFeedbackListProps {
  /** The consuming app's own zero-argument getMyFeedback() wrapper. */
  fetchItems: () => Promise<ActionResult<MyFeedbackItem[]>>;
}

// Softened per Phase 1 item 5 — "declined" reads harshly to the person who
// wrote it; the internal vocabulary and the state machine are unchanged,
// this is display-only.
const STATUS_LABELS: Record<string, string> = {
  new: "Received",
  triaged: "In review",
  done: "Done",
  declined: "Not planned",
};

const KNOWN_APPS: ReadonlySet<string> = new Set<AppBadgeApp>(["portal", "admin"]);

function isKnownApp(app: string): app is AppBadgeApp {
  return KNOWN_APPS.has(app);
}

// First line, 140 chars, "…" if cut — an account-settings list preview, not
// the full body.
function truncateBody(body: string): string {
  const firstLine = body.split("\n")[0] ?? "";
  return firstLine.length > 140 ? `${firstLine.slice(0, 140)}…` : firstLine;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; items: MyFeedbackItem[] };

export function MyFeedbackList({ fetchItems }: MyFeedbackListProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchItems()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setState({ kind: "loaded", items: result.data ?? [] });
        } else {
          setState({ kind: "error" });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchItems]);

  if (state.kind === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your feedback…
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Couldn&apos;t load your feedback right now.
      </p>
    );
  }

  if (state.items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You haven&apos;t submitted any feedback yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {state.items.map((item) => (
        <li
          key={item.id}
          // 360px: flex-col stack, nothing assumes a minimum width.
          className="flex flex-col gap-1.5 rounded-md border border-border p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            {isKnownApp(item.app) ? (
              <AppBadge app={item.app} />
            ) : (
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                {item.app}
              </span>
            )}
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {STATUS_LABELS[item.status] ?? item.status}
            </span>
          </div>
          <p className="text-sm text-foreground">{truncateBody(item.body)}</p>
          <FormattedDate
            value={item.createdAt}
            mode="date"
            className="text-xs text-muted-foreground"
          />
        </li>
      ))}
    </ul>
  );
}
