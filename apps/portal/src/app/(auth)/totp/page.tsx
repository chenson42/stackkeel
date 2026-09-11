import { redirect } from "next/navigation";
import { TotpVerifyForm } from "@repo/ui";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { userTotp } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sanitizeCallbackUrl } from "@/lib/auth/safe-callback";
import { needsTwoFactorVerification } from "@/lib/auth/two-factor-gate";
import { verifyTotp } from "./actions";

export default async function TotpPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const sp = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(sp.callbackUrl);

  // A session that no longer needs 2FA verification (already verified this
  // session, or 2FA isn't required at all) has nothing to do here — send it
  // on to its real destination instead of re-rendering the code form
  // (2026-09-04-shared-login-component, Phase 2/3 Notes item 8's
  // "already-authenticated" redirect, applied to /totp's own equivalent:
  // already-verified rather than already-signed-in).
  if (!needsTwoFactorVerification(session.user)) {
    redirect(callbackUrl);
  }

  const enrollment = await db.query.userTotp.findFirst({
    where: eq(userTotp.userId, session.user.id),
  });

  if (!enrollment) {
    redirect(
      "/account/2fa?callbackUrl=" + encodeURIComponent(callbackUrl)
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted p-4">
      <TotpVerifyForm
        app="portal"
        callbackUrl={callbackUrl}
        onSubmitTotp={verifyTotp}
        acceptsRecoveryCode
      />
    </div>
  );
}
