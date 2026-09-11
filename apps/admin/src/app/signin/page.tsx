import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sanitizeCallbackUrl, resolvePostSignInDestination } from "@/lib/auth/post-signin";
import { ADMIN_APP_ROLE_NAMES } from "@/lib/admin-app-roles";
import { AdminSignInForm } from "./admin-sign-in-form";

// Thin server wrapper. AdminSignInForm (2026-09-04-shared-login-component,
// Increment C) owns the entire Card across both the credentials step and
// the TOTP step, mirroring the prior SignInCredentialsForm's own
// single-component-owns-both-steps shape (docs/work-log/2026-09-04-totp-
// per-login-gap.md) — Admin's `authorize()` remains an ATOMIC check (both
// steps submit against the same not-yet-issued session), so a page-level
// Card/Google-button/error-banner sitting above a TOTP prompt would be
// confusing mid-flow. See that component's own header comment for why this
// increment did NOT converge Admin onto Portal's separate-route model.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(sp.callbackUrl);

  // Redirect an already-authenticated user away from /signin instead of
  // re-rendering the form (2026-09-04-shared-login-component, Phase 2/3
  // Notes item 8 — a real, pre-existing doc/code gap: every app's own
  // route-group rule, "public, redirect signed-in users away," was never
  // actually implemented). Routed through the same resolvePostSignInDestination
  // this app's sign-in action already uses, so an authenticated session
  // without a Admin role or without TOTP still lands on
  // /access-pending or /setup-mfa rather than being bounced straight to a
  // gated destination.
  const session = await auth();
  if (session?.user) {
    const hasAdminAppRole = (session.user.roles ?? []).some((r) =>
      (ADMIN_APP_ROLE_NAMES as readonly string[]).includes(r),
    );
    redirect(
      resolvePostSignInDestination(
        { hasAdminAppRole, hasTotp: session.user.hasTotp },
        callbackUrl,
      ),
    );
  }

  // AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET are themselves the implicit flag for
  // this provider — same convention apps/portal/src/app/(auth)/signin/
  // page.tsx already uses. Unset means the provider is unusable
  // server-side, so the button must not render either.
  const googleLoginEnabled = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
  );

  const initialError =
    sp.error === "deactivated"
      ? "This account has been deactivated. Contact another Admin admin."
      : sp.error === "CredentialsSignin"
        ? "Wrong email or password."
        : undefined;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted p-4">
      <AdminSignInForm
        callbackUrl={callbackUrl}
        googleLoginEnabled={googleLoginEnabled}
        initialError={initialError}
      />
    </div>
  );
}
