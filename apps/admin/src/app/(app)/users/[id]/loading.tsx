// Matrix-shaped loading skeleton for /users/[id] — distinct from the
// shared (app)/loading.tsx list skeleton, since this page's real content
// (a Card-framed RoleMatrix) has a different shape than a table list.
export default function UserDetailLoading() {
  return (
    <div className="max-w-2xl animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded bg-muted" />
        <div className="h-4 w-64 rounded bg-muted" />
      </div>
      <div className="mt-6 rounded-xl border border-border p-6">
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="mt-4 h-4 w-full rounded bg-muted" />
      </div>
      <div className="mt-6 rounded-xl border border-border p-6">
        <div className="h-5 w-24 rounded bg-muted" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 w-full rounded bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
