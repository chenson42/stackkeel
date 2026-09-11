import type { BackLinkRoute, BackLinkFallback } from "@repo/ui";

/**
 * Portal's own route-prefix -> label table for `resolveBackLink`, per
 * Phase 3 § 6 of docs/work-log/2026-09-07-back-nav-and-shell-consistency.md.
 * `/tasks/[id]` is the only multi-origin page in Portal today (3 known
 * linkers) — `resolveBackLink` is the shared *mechanism* (packages/ui),
 * this table is the per-app *data*, same split as `FEATURES`/`hasFeature()`.
 */
export const TASK_BACK_ROUTES: readonly BackLinkRoute[] = [
  { prefix: "/tasks", name: "My Tasks" },
  { prefix: "/projects", name: "Projects" },
  { prefix: "/notifications", name: "Notifications" },
];

export const TASK_BACK_FALLBACK: BackLinkFallback = {
  href: "/tasks",
  name: "My Tasks",
};
