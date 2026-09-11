import type { ReactNode } from "react";

/**
 * Generic `/home` panel container (task-mgmt-1a-inc4-list-view, architect
 * ruling #5 / FR-DSH-02). Nothing task-specific lives here — `<TasksPanel>`
 * is the first instance; a later module (announcements, events, a Staff
 * active-projects panel) mounts as a sibling `<DashboardPanel>` with zero
 * `/home` redesign, which is the whole point of extracting this container
 * instead of hand-rolling the section markup once per panel.
 */
export function DashboardPanel({
  title,
  action,
  children,
}: {
  title: string;
  /** Optional top-right link/button, e.g. "View all →". */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
