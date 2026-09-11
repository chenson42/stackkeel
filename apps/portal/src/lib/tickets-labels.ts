import type {
  ChangeClass,
  TicketArea,
  TicketPriority,
  TicketStatus,
} from "@repo/db";

/**
 * Display labels — AND, below, re-declared vocabulary arrays — for the
 * helpdesk controlled vocabularies.
 *
 * WHY THE ARRAYS ARE RE-DECLARED HERE RATHER THAN RE-EXPORTED FROM
 * `@repo/db`'s tickets module: server actions importing that module pull
 * `server-only` into its graph via the app's db client, so importing ANY
 * value through the same path from a `'use client'` component that needs
 * to render a `<select>` poisons the module graph and fails `next build`.
 * Type-only imports (`import type { ... }`) ARE safe — erased at compile
 * time, never reach the bundler — so every client-side `<select>` imports
 * its TYPES from `@repo/db` and its VALUES (the arrays below) from here.
 * The arrays must stay identical to `packages/db/src/tickets.ts`'s own
 * CHANGE_CLASSES/TICKET_AREAS/TICKET_PRIORITIES/TICKET_STATUSES — a future
 * edit to one CHECK constraint's allowed values needs both (and the schema
 * migration). tickets-labels.test.ts asserts the mirror.
 */

export const CHANGE_CLASSES = [
  "content",
  "config",
  "theme",
  "bug",
  "feature",
] as const satisfies readonly ChangeClass[];

export const TICKET_AREAS = [
  "account",
  "billing",
  "content",
  "website",
  "other",
] as const satisfies readonly TicketArea[];

export const TICKET_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const satisfies readonly TicketPriority[];

export const TICKET_STATUSES = [
  "new",
  "triaged",
  "in_progress",
  "resolved",
  "declined",
] as const satisfies readonly TicketStatus[];

export const CHANGE_CLASS_LABELS: Record<ChangeClass, string> = {
  content: "Content",
  config: "Configuration",
  theme: "Appearance",
  bug: "Bug",
  feature: "Feature request",
};

export const TICKET_AREA_LABELS: Record<TicketArea, string> = {
  account: "Account",
  billing: "Billing",
  content: "Content",
  website: "Website",
  other: "Other",
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: "New",
  triaged: "Triaged",
  in_progress: "In progress",
  resolved: "Resolved",
  declined: "Declined",
};

/**
 * StatusPill variant per value (@repo/ui's closed variant set — never raw
 * palette literals) — always paired with the text label, never color alone
 * as the signal (UI-STANDARDS accessibility rule).
 */
export const TICKET_STATUS_VARIANT: Record<
  TicketStatus,
  "active" | "pending" | "attention" | "neutral"
> = {
  new: "attention",
  triaged: "pending",
  in_progress: "pending",
  resolved: "active",
  declined: "neutral",
};

export const TICKET_PRIORITY_VARIANT: Record<
  TicketPriority,
  "active" | "pending" | "attention" | "neutral"
> = {
  low: "neutral",
  normal: "neutral",
  high: "pending",
  urgent: "attention",
};
