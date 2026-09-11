import { redirect } from "next/navigation";
import {
  AppBadge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui";
import { auth, signIn } from "@/auth";
import { db } from "@/lib/db";
import { sanitizeCallbackUrl } from "@/lib/auth/safe-callback";
import { resolvePostSignInDestination } from "@/lib/auth/two-factor-gate";
import { isLocalLoginEnabled } from "@/lib/auth/local-login";
import { isFlagEnabled } from "@/lib/flags";
import {
  ATOMIC_TOTP_FLAG,
  computeSecondFactorPolicy,
} from "@/lib/auth/second-factor-policy";
import { resolvePortalAtomicPostSignInDestination } from "@/lib/auth/atomic-post-signin";
import { signInWithCredentialsLegacy } from "./actions";
import { PortalCredentialsSignInForm } from "./portal-credentials-sign-in-form";
import { PortalSignInForm } from "./portal-sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(sp.callbackUrl);

  // 2026-09-08 atomic-2FA convergence, Increment 1 (client half) —
  // ATOMIC_TOTP_FLAG read here (RSC, Node-side, cache()-deduped same as
  // every other isFlagEnabled() caller) picks BOTH which client component
  // renders below AND how an already-authenticated visitor is routed away.
  // authorize()'s OWN flag read (src/auth.ts) is always the authoritative
  // one for what actually happens at sign-in — this read only decides UI
  // and the already-authenticated redirect; a stale read here (page loaded
  // flag=on, flag flips before submit) is never a security gap, only a
  // possible mismatched error on that one submit (work-log Phase 3 § 8).
  const atomicEnabled = await isFlagEnabled(ATOMIC_TOTP_FLAG);

  // Redirect an already-authenticated user away from /signin instead of
  // re-rendering the form (2026-09-04-shared-login-component, Phase 2/3
  // Notes item 8 — a real, pre-existing doc/code gap: this route-group's
  // own rule, "public, redirect signed-in users away," was never actually
  // implemented). Route through the same resolve function a fresh sign-in
  // uses so an authenticated-but-still-2FA-unverified user lands on /totp
  // rather than being bounced straight to a gated destination.
  const session = await auth();
  if (session?.user) {
    // A session's OWN atomicTotpEnabled claim (fixed at mint time, Phase 4
    // server half's jwt() fix) — not the CURRENT flag read above — decides
    // which resolver applies. This matters because /signin is in
    // proxy.ts's PUBLIC_PATHS (its own edge-side § 7(a) nudge never runs
    // here): an admin-ish, never-enrolled atomic session that manually
    // revisits /signin needs the SAME /account/2fa nudge it would get on
    // any other navigation, or this one path silently skips it. Any
    // session minted by the legacy path (or Google OAuth, or an atomic
    // session before this claim existed) has atomicTotpEnabled undefined/
    // false and falls through to the unchanged legacy resolver, exactly
    // today's behavior.
    if (session.user.atomicTotpEnabled) {
      const policy = await computeSecondFactorPolicy(db, session.user.id);
      redirect(resolvePortalAtomicPostSignInDestination(policy, callbackUrl));
    }
    redirect(resolvePostSignInDestination(session.user, callbackUrl));
  }

  // isLocalLoginEnabled() is fail-open — returns true on DB error or missing
  // row, so this read never causes a 500 on the sign-in page.
  const localLoginEnabled = await isLocalLoginEnabled();
  // AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET are themselves the implicit flag for
  // this provider (2026-09-03-google-oauth.md) — unset means the provider
  // is unusable server-side, so the button must not render either.
  const googleLoginEnabled = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
  );
  const siteKeySet = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  async function handleGoogleSignIn() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }

  const initialError =
    sp.error === "deactivated"
      ? "This account has been deactivated. Contact an administrator."
      : sp.error === "CredentialsSignin"
        ? "Wrong email or password."
        : undefined;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted p-4">
      {localLoginEnabled ? (
        atomicEnabled ? (
          // 2026-09-08 atomic-2FA convergence, Increment 1 (client half).
          // PortalSignInForm owns its own two-step swap internally
          // (credentials -> TotpVerifyForm) — see that file's own header
          // for why it wraps PortalCredentialsSignInForm rather than
          // receiving a captchaSlot prop from this Server Component.
          <PortalSignInForm
            callbackUrl={callbackUrl}
            initialError={initialError}
            emailPlaceholder="you@the ancestor site"
            onGoogleSignIn={googleLoginEnabled ? handleGoogleSignIn : undefined}
            forgotPasswordHref="/forgot-password"
            siteKeySet={siteKeySet}
            footnote={
              <>
                First time? Run <code>npm run db:seed</code> to provision the
                seeded admin user.
              </>
            }
          />
        ) : (
          // TODAY's exact render, unchanged — flag off must reproduce
          // today's behavior byte-for-byte (Phase 3 § 8's rollback
          // contract). signInWithCredentialsLegacy is the same function
          // body as the pre-split signInWithCredentials, renamed only.
          <PortalCredentialsSignInForm
            app="portal"
            description="Sign in to Portal."
            callbackUrl={callbackUrl}
            initialError={initialError}
            onSubmitCredentials={signInWithCredentialsLegacy}
            emailPlaceholder="you@the ancestor site"
            onGoogleSignIn={googleLoginEnabled ? handleGoogleSignIn : undefined}
            forgotPasswordHref="/forgot-password"
            siteKeySet={siteKeySet}
            footnote={
              <>
                First time? Run <code>npm run db:seed</code> to provision the
                seeded admin user.
              </>
            }
          />
        )
      ) : (
        // auth.local_login is OFF: the credentials endpoint itself must not
        // render (this is a page-level decision made before
        // CredentialsSignInForm is ever mounted, per Phase 3's Permissions
        // & Flags section — the shared component has no prop to hide its
        // own email/password fields, and deliberately shouldn't: a
        // "credentials disabled" mode is a Portal-only flag concept that
        // has no equivalent in a predecessor app/Admin, so it stays out of the
        // shared component's contract, not bolted on as a one-off prop).
        // Falls back to a small local card carrying the same branding
        // (AppBadge, title, description) with only the Google button
        // inside — mirroring the pre-refactor page's structure exactly for
        // this rare (flag-disabled) branch.
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>Sign in to Portal.</CardDescription>
            <CardAction>
              <AppBadge app="portal" />
            </CardAction>
          </CardHeader>
          <CardContent>
            {initialError && (
              <p
                role="alert"
                className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground"
              >
                {initialError}
              </p>
            )}
            {googleLoginEnabled && (
              <form action={handleGoogleSignIn}>
                <Button type="submit" variant="outline" className="w-full">
                  Sign in with Google
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
