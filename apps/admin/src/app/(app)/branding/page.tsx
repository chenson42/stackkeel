import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { PageHeader } from "@repo/ui";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { branding } from "@/lib/db/schema";
import { FEATURES, hasFeature } from "@repo/permissions";
import { isFlagEnabled } from "@/lib/flags";
import { BrandingForm } from "./branding-form";

export default async function BrandingPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (!hasFeature(session.user.features, FEATURES.ADMIN_BRANDING)) redirect("/");

  const [row] = await db
    .select({
      seedHex: branding.seedHex,
      typePairing: branding.typePairing,
      lightOnly: branding.lightOnly,
    })
    .from(branding)
    .where(eq(branding.id, "default"))
    .limit(1);

  const flagEnabled = await isFlagEnabled("ui.brand_theming");

  return (
    <>
      <PageHeader
        title="Branding"
        description="One seed color drives the whole ramp — contrast floors are enforced by the generator, so every result stays accessible."
      />

      {!flagEnabled && (
        <div className="mt-4 max-w-2xl rounded-lg border border-border bg-muted p-4 text-sm">
          The <code className="font-mono text-xs">ui.brand_theming</code> flag is
          off, so the apps render the static Starter palette. Saving here is
          safe — the brand goes live when the flag is enabled under Feature
          flags.
        </div>
      )}

      <div className="mt-6">
        <BrandingForm initial={row ?? null} flagEnabled={flagEnabled} />
      </div>
    </>
  );
}
