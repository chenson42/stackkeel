import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { userTotp } from "@/lib/db/schema";
import { getOrCreatePendingEnrollment } from "@repo/auth/totp-pending";
import { sanitizeCallbackUrl } from "@/lib/auth/post-signin";
import { MfaSetupForm } from "./mfa-setup-form";

// Mandatory, unconditional TOTP enrollment (DECISION-054 point 4) — this
// page is where src/proxy.ts sends every admin_*-role session with
// !hasTotp. Mirrors a predecessor app's src/app/(auth)/setup-mfa/page.tsx's own
// page shape (Phase 3 Component Plan), rebuilt against this app's own
// getOrCreatePendingEnrollment() (now the shared, promoted
// @repo/auth/totp-pending — Increment 1 of the 2FA consolidation,
// 2026-09-07) rather than a predecessor app's client-round-tripped-secret pattern in
// src/app/api/mfa/setup/route.ts — holding the secret server-side (the
// pending-enrollment table) closes the "client posts back any secret it
// wants" gap the shared userTotpPendingEnrollments table exists for.
export default async function SetupMfaPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/signin");
  }
  const sp = await searchParams;
  // Was a bare `startsWith("/")` check — passes a protocol-relative value
  // like `//evil.example` straight through into mfa-setup-form.tsx's
  // client-side router.push(). Every other callback-URL site in all three
  // apps was converged onto the shared, hardened sanitizeCallbackUrl()
  // during 2026-09-04-shared-login-component specifically to close this
  // bypass class; this page was missed. Fixed 2026-09-05 (ad-hoc security
  // audit finding).
  const callbackUrl = sanitizeCallbackUrl(sp.callbackUrl);

  // Increment 2 of the 2FA consolidation (2026-09-07): guards against an
  // already-enrolled admin reaching this page directly (typed URL, stale
  // bookmark, browser back-button after enrolling). src/proxy.ts's gate
  // only forces an UNENROLLED user TOWARD /setup-mfa — it never blocked an
  // enrolled one from reaching it. Without this, completeTotpEnrollmentAction
  // silently deletes and re-inserts userTotpRecoveryCodes on every call,
  // invalidating recovery codes the user already holds with no confirmation.
  //
  // Reads the live `userTotp` row rather than trusting session.user.hasTotp
  // (the JWT claim) — the claim can lag reality across a session-refresh
  // race, and the whole point of this guard is to close that class of gap,
  // not reintroduce a narrower version of it. The page already does one DB
  // round trip via getOrCreatePendingEnrollment below when unenrolled, so
  // one more findFirst is not a new cost class.
  const existing = await db.query.userTotp.findFirst({
    where: eq(userTotp.userId, session.user.id),
  });

  if (existing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Two-factor authentication is already enabled</CardTitle>
            <CardDescription>
              Your account already has 2FA set up. Re-enrolling here isn&apos;t
              available yet — management tools are coming soon.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href={callbackUrl}>Continue</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { uri, secret } = await getOrCreatePendingEnrollment(
    db,
    session.user.id,
    session.user.email,
    "ADMIN",
  );
  const qrCodeDataUrl = await QRCode.toDataURL(uri);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <MfaSetupForm qrCodeDataUrl={qrCodeDataUrl} secret={secret} callbackUrl={callbackUrl} />
    </div>
  );
}
