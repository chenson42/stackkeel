import Link from "next/link";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";

export default async function AccessPending({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  // Permitted server-side DB write during RSC render. This is NOT a cookie
  // or header mutation (which Next.js 16 prohibits in RSC). recordAudit()
  // performs a server-side DB insert — a first-class RSC I/O concern.
  // The check:audit tripwire scans only src/app/**/actions.ts; this call
  // site is intentionally outside that scope (see AUDIT_ACTIONS.ACCESS_DENIED
  // comment in src/lib/audit.ts).
  //
  // NOTE: `from` is advisory metadata sourced from the ?from= query param
  // set by src/proxy.ts. It is not a verified claim — a user could hand-craft
  // /access-pending?from=/fake-path. The only consequence is a misleading
  // attemptedPath value in their own audit row; no privilege escalation is
  // possible.
  await recordAudit({
    action: AUDIT_ACTIONS.ACCESS_DENIED,
    resourceType: "user",
    metadata: { attemptedPath: from ?? null },
  });
  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-2xl font-semibold">Access pending</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Your account exists, but doesn&apos;t yet have permission for this area.
        Ask an administrator to grant you the right role.
      </p>
      <Link
        href="/home"
        className="mt-6 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to home
      </Link>
    </main>
  );
}
