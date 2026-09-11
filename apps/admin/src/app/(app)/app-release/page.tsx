import { redirect } from "next/navigation";
import { PageHeader, FormattedDate } from "@repo/ui";
import { getReleasePolicy } from "@repo/db";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { FEATURES, hasFeature } from "@repo/permissions";
import { ReleasePolicyForm } from "./release-policy-form";

/**
 * /app-release — native version-gate policy editor (module `mobile`).
 * Gated on ADMIN_DEVICES (device fleet management and its update policy are
 * one privilege). The gate UI itself is additionally behind the
 * `mobile.update_check` flag — noted here so an operator setting a policy
 * with the flag off understands why nothing changes on devices yet.
 */
export default async function AppReleasePage() {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_DEVICES)) {
    redirect("/access-pending");
  }

  const policy = await getReleasePolicy(db);

  return (
    <>
      <PageHeader
        title="App release policy"
        description="Drives the native apps' update nudge (below latest) and hard block (below minimum). Takes effect only while the mobile.update_check flag is on."
      />
      {policy && (
        <p className="mt-2 text-xs text-muted-foreground">
          Last updated <FormattedDate value={policy.updatedAt} />
        </p>
      )}
      <ReleasePolicyForm
        initial={{
          minBuild: policy?.minBuild ?? null,
          latestBuild: policy?.latestBuild ?? null,
          softMessage: policy?.softMessage ?? null,
        }}
      />
    </>
  );
}
