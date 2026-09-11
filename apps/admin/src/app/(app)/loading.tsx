// Loading skeleton for the /users and /requests list pages — both are
// RSC direct-DB-query pages (Portal's own no-client-fetch pattern), so the
// "loading" state Next streams here is the Suspense boundary around this
// route group's initial render/navigation, not a client-side spinner.
// Shape mirrors a list page: a heading row + a bordered table skeleton, not
// a bare spinner, per the "loading (skeleton, not blank)" requirement.
export default function AppLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded bg-muted" />
          <div className="h-4 w-56 rounded bg-muted" />
        </div>
        <div className="h-9 w-28 rounded-full bg-muted" />
      </div>
      <div className="mt-6 overflow-hidden rounded-md border border-border">
        <div className="h-10 border-b border-border bg-muted/50" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-3 py-3 last:border-0">
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-4 w-24 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
