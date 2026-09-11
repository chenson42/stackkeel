import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";

// Zero-admin_*-role authenticated visitor landing — mirrors
// apps/portal/src/app/access-pending/page.tsx's exact shape (Phase 3 route
// table). Permitted server-side DB write during RSC render (recordAudit()
// is a DB insert, not a cookie/header mutation, which Next.js 16
// prohibits in RSC).
export default async function AccessPending({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  // `from` is advisory metadata sourced from src/proxy.ts's ?from= query
  // param — not a verified claim, same caveat as Portal's own site.
  await recordAudit({
    action: AUDIT_ACTIONS.ADMIN_ACCESS_DENIED,
    resourceType: "user",
    metadata: { attemptedPath: from ?? null },
  });
  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-2xl font-semibold">Access pending</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Your account exists, but doesn&apos;t yet have permission for Admin. Ask a
        Admin admin to grant you access.
      </p>
    </main>
  );
}
