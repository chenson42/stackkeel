import { Button, Input, Label } from "@repo/ui";

/**
 * Filter bar for the cross-app audit viewer.
 *
 * A plain `<form method="get">` — deliberately NOT a Client Component.
 *
 * Two reasons. First, there is no `"use client"` boundary to get wrong, and
 * this app has already shipped one bug in this exact viewer that typecheck
 * could not see. Second, the filter state lands in the URL, so a query is
 * shareable ("here is the link showing who changed that role") and the back
 * button behaves, both for free.
 *
 * `defaultValue` rather than `value`: these are uncontrolled inputs on a real
 * form submission, so the browser owns their state between navigations.
 */
export function AuditFilters({
  apps,
  current,
}: {
  /** Apps whose tables actually exist on this database. */
  apps: string[];
  current: {
    app?: string;
    action?: string;
    actor?: string;
    resource?: string;
    since?: string;
    until?: string;
  };
}) {
  const hasAnyFilter = Object.values(current).some((v) => v);

  return (
    <form
      method="get"
      className="mt-6 rounded-lg border border-border bg-card p-4"
      aria-label="Filter audit events"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="audit-app">App</Label>
          <select
            id="audit-app"
            name="app"
            defaultValue={current.app ?? ""}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value="">All apps</option>
            {apps.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-action">Event type</Label>
          <Input
            id="audit-action"
            name="action"
            defaultValue={current.action ?? ""}
            placeholder="admin.role"
          />
          {/* Prefix, not contains — action names are hierarchical, so a
              prefix selects a whole family. Say so, or the box looks broken
              when a mid-string search returns nothing. */}
          <p className="text-muted-foreground text-xs">Matches from the start of the name.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-actor">Actor email</Label>
          <Input
            id="audit-actor"
            name="actor"
            defaultValue={current.actor ?? ""}
            placeholder="someone@the ancestor site"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-resource">Resource</Label>
          <Input
            id="audit-resource"
            name="resource"
            defaultValue={current.resource ?? ""}
            placeholder="user id or type"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-since">From</Label>
          <Input id="audit-since" name="since" type="date" defaultValue={current.since ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-until">To</Label>
          <Input id="audit-until" name="until" type="date" defaultValue={current.until ?? ""} />
          <p className="text-muted-foreground text-xs">Includes the whole day.</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit">Apply filters</Button>
        {/* A link, not a reset button: reset would restore the last submitted
            values, not clear the query. Only a fresh GET actually clears it. */}
        {hasAnyFilter && (
          <Button asChild variant="ghost">
            <a href="/audit">Clear</a>
          </Button>
        )}
      </div>
    </form>
  );
}
