import { redirect } from "next/navigation";
import { PageHeader, FormattedDate } from "@repo/ui";
import { listFlags } from "@repo/db";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { FEATURES, hasFeature } from "@repo/permissions";
import { FlagRowToggle } from "./flag-row-toggle";

// Feature flags viewer/editor (2026-09-05-admin-menu-structure).
//
// The FIRST write path anywhere in the codebase for the shared
// `feature_flags` table — until now only a reader (isFlagEnabledFor())
// existed. Scope is shown plainly per the design's own instruction: `app:
// null` reads as "Platform-wide", reusing apps/admin/src/lib/flags.ts's own
// comment language so "platform-wide" means the same thing to an operator
// here that it means in the code.
//
// Gated on its own ADMIN_FLAGS feature — toggling a flag is a materially
// different, separately-revocable privilege from managing users or reading
// audit logs.
const APP_LABELS: Record<string, string> = {
  portal: "Portal",
  admin: "ADMIN",
};

export default async function FlagsPage() {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_FLAGS)) {
    redirect("/access-pending");
  }

  const flags = await listFlags(db);

  return (
    <>
      <PageHeader
        title="Feature flags"
        description="Platform-wide and per-app flags, shared across every app."
        count={flags.length}
        countLabel="flags"
      />

      {flags.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">No flags exist yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Flags are created by any app calling <code>isFlagEnabledFor()</code> against a new key,
            or by an operator via a future &ldquo;new flag&rdquo; action — not yet built.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Key</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Scope</th>
                <th className="pb-2 pr-4 font-medium">Description</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Rollout %</th>
                <th className="pb-2 pr-4 font-medium whitespace-nowrap">Updated</th>
                <th className="pb-2 font-medium whitespace-nowrap">Enabled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {flags.map((flag) => (
                <tr key={flag.key} className="align-top">
                  <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">{flag.key}</td>
                  <td className="py-3 pr-4 text-xs whitespace-nowrap">
                    {flag.app === null ? (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                        Platform-wide
                      </span>
                    ) : (
                      (APP_LABELS[flag.app] ?? flag.app)
                    )}
                  </td>
                  <td className="py-3 pr-4 max-w-[320px]">
                    <span className="block text-xs text-muted-foreground">
                      {flag.description ?? "—"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-xs whitespace-nowrap">{flag.rolloutPercent}%</td>
                  <td className="py-3 pr-4 text-xs whitespace-nowrap text-muted-foreground">
                    <FormattedDate value={flag.updatedAt} mode="datetime" />
                  </td>
                  <td className="py-3">
                    <FlagRowToggle flagKey={flag.key} app={flag.app} initialEnabled={flag.enabled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
