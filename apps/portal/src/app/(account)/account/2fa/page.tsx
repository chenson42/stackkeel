import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BackLink, PageHeader } from "@repo/ui";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  userTotp,
  userTotpRecoveryCodes,
} from "@/lib/db/schema";
import { FRESH_RECOVERY_CODES_COOKIE } from "@/lib/two-factor";
import {
  getOrCreatePendingEnrollment,
  PENDING_TTL_MINUTES,
} from "@repo/auth/totp-pending";
import { sanitizeCallbackUrl } from "@/lib/auth/safe-callback";
import { clearFreshCodesCookieAction } from "./actions";
import { TotpEnrollForm } from "./totp-enroll-form";
import { RegenerateCodesForm } from "./regenerate-codes-form";
import { FormattedDate } from "@repo/ui";
import { FreshRecoveryCodes } from "@/components/shared/fresh-recovery-codes";

export default async function AccountTwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/account/2fa");

  const sp = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(sp.callbackUrl);

  const jar = await cookies();
  const rawFreshCodes = jar.get(FRESH_RECOVERY_CODES_COOKIE)?.value ?? null;
  let freshCodes: string[] | null = null;
  if (rawFreshCodes) {
    try {
      const parsed = JSON.parse(rawFreshCodes);
      freshCodes = Array.isArray(parsed)
        ? parsed.filter((s): s is string => typeof s === "string")
        : null;
    } catch {
      freshCodes = null;
    }
  }

  const existing = await db.query.userTotp.findFirst({
    where: eq(userTotp.userId, session.user.id),
  });

  // Already enrolled — show management view
  if (existing) {
    const recoveryRows = await db.query.userTotpRecoveryCodes.findMany({
      where: eq(userTotpRecoveryCodes.userId, session.user.id),
    });
    const totalCodes = recoveryRows.length;
    const unusedCount = recoveryRows.filter((c) => !c.usedAt).length;

    return (
      <div className="max-w-xl">
        <div className="mb-6">
          <BackLink href="/home" label="Back to Home" />
        </div>
        <PageHeader
          title="Two-factor authentication"
          description={
            <>
              You enrolled on{" "}
              <FormattedDate value={existing.enrolledAt} mode="date" />.
              {existing.lastUsedAt && (
                <> Last used: <FormattedDate value={existing.lastUsedAt} mode="datetime" />.</>
              )}
            </>
          }
        />

        {freshCodes && (
          <FreshRecoveryCodes
            codes={freshCodes}
            onDisplayed={clearFreshCodesCookieAction}
          />
        )}

        <div className="mt-6 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">Recovery codes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {unusedCount} unused code{unusedCount === 1 ? "" : "s"} remaining
            (of {totalCodes} total).
          </p>
          <RegenerateCodesForm />
        </div>
      </div>
    );
  }

  // Not enrolled — reuse the pending row if it's still valid, otherwise mint
  // a new one.  Reusing the row keeps the QR code stable across page reloads
  // within the TTL window so the user's authenticator app stays in sync.
  const enrollData = await getOrCreatePendingEnrollment(
    db,
    session.user.id,
    session.user.email ?? "user@example.com",
  );

  return (
    <TotpEnrollForm
      uri={enrollData.uri}
      secret={enrollData.secret}
      pendingTtlMinutes={PENDING_TTL_MINUTES}
      callbackUrl={callbackUrl}
    />
  );
}
