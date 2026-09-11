"use client";

// PortalSignInForm — 2026-09-08 atomic-2FA convergence, Increment 1 (client
// half). Two-step, same-route progressive disclosure: step 1 collects
// email+password; on MFA_REQUIRED, step 2 collects the second factor and
// RESUBMITS the full credential set (email+password+code together) — the
// same shape apps/admin/src/app/signin/admin-sign-in-form.tsx already
// proves works for Admin's own atomic authorize(), per this increment's
// Phase 1 § C / Phase 3 § 3 ruling: reuse the working precedent, don't
// invent a new one.
//
// Step 1 reuses the EXISTING `PortalCredentialsSignInForm` wrapper
// (portal-credentials-sign-in-form.tsx) rather than composing
// `CredentialsSignInForm` + a fresh Turnstile slot here — that wrapper
// already solves the exact RSC-boundary problem Turnstile's `captcha.render`
// closure has (a Server Component cannot construct a plain closure and
// hand it to a Client Component; see that file's own header). This
// component is itself already a Client Component (this file, "use client"),
// so IT can pass `PortalCredentialsSignInForm` a different
// `onSubmitCredentials` — the atomic action below — without page.tsx (a
// Server Component) ever needing to touch the Turnstile closure itself.
// This is a deliberate divergence from Phase 3 § 3's own code sample, which
// sketched a `captchaSlot` prop threaded from page.tsx into this component —
// that shape would have re-introduced the same RSC-boundary problem
// `portal-credentials-sign-in-form.tsx` already exists to solve, for no
// benefit. See the work-log's Phase 4 (client) § Divergence for the full
// reasoning.
//
// Step 2 reuses `TotpVerifyForm`'s existing `acceptsRecoveryCode` mode
// (packages/ui/src/components/auth/totp-verify-form.tsx) — Portal is the
// one app with a real recovery-code implementation to reuse (Phase 3 § 3).
// No packages/ui change: the component swap between step 1 and step 2 IS
// the Turnstile-scoping mechanism (Phase 3 § 6) — `captcha` only ever
// reaches `CredentialsSignInForm` (via the step-1 wrapper), which only
// mounts on `step === "credentials"`.

import { useState } from "react";
import type { ReactNode } from "react";
import { TotpVerifyForm, type AuthFormResult } from "@repo/ui";
import { PortalCredentialsSignInForm } from "./portal-credentials-sign-in-form";
import { signInWithCredentialsAtomic } from "./actions";

type Step = "credentials" | "totp";

interface Props {
  callbackUrl: string;
  initialError?: string;
  emailPlaceholder?: string;
  forgotPasswordHref?: string;
  siteKeySet: boolean;
  onGoogleSignIn?: () => Promise<void>;
  footnote?: ReactNode;
}

export function PortalSignInForm({
  callbackUrl,
  initialError,
  emailPlaceholder,
  forgotPasswordHref,
  siteKeySet,
  onGoogleSignIn,
  footnote,
}: Props) {
  const [step, setStep] = useState<Step>("credentials");
  // Held in local React state, never sent anywhere but back to this same
  // authorize() call on step 2 — mirrors AdminSignInForm's own comment
  // verbatim.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleCredentialsSubmit(input: {
    email: string;
    password: string;
    turnstileToken?: string;
    callbackUrl: string;
  }): Promise<AuthFormResult> {
    const result = await signInWithCredentialsAtomic({
      email: input.email,
      password: input.password,
      turnstileToken: input.turnstileToken,
      callbackUrl: input.callbackUrl,
    });
    if (result && "mfaRequired" in result) {
      // Correct password, TOTP enrolled, no code submitted yet — NOT a
      // failed login. Swap to the TOTP step; the credentials just typed
      // are resubmitted (never re-entered) alongside the code.
      setEmail(input.email);
      setPassword(input.password);
      setStep("totp");
      return undefined;
    }
    if (result && "error" in result) return { error: result.error };
    // No result at all means the action completed its own redirect().
    return undefined;
  }

  async function handleTotpSubmit(input: {
    code: string;
    callbackUrl: string;
  }): Promise<AuthFormResult> {
    const result = await signInWithCredentialsAtomic({
      email,
      password,
      totpCode: input.code,
      callbackUrl: input.callbackUrl,
    });
    if (result && "error" in result) return { error: result.error };
    if (result && "mfaRequired" in result) {
      // Should not happen (a code was just submitted) — surface as an
      // error rather than silently looping, matching AdminSignInForm.
      return { error: "Invalid authentication code. Please try again." };
    }
    return undefined;
  }

  if (step === "totp") {
    return (
      <TotpVerifyForm
        app="portal"
        acceptsRecoveryCode
        description="Enter the 6-digit code from your authenticator app, or a recovery code."
        callbackUrl={callbackUrl}
        onSubmitTotp={handleTotpSubmit}
      />
      // backHref intentionally omitted — TotpVerifyForm only supports
      // next/link navigation for "back," not a local state-reset callback.
      // Same accepted, disclosed small UX regression Phase 1 § C already
      // named for this convergence (a predecessor app/Admin lose their in-place
      // Back affordance too). A user who wants to try a different account
      // has no session to sign out of (none was ever issued under the
      // atomic model) — reloading /signin is the only way out.
    );
  }

  return (
    <PortalCredentialsSignInForm
      app="portal"
      description="Sign in to Portal."
      callbackUrl={callbackUrl}
      initialError={initialError}
      onSubmitCredentials={handleCredentialsSubmit}
      emailPlaceholder={emailPlaceholder}
      onGoogleSignIn={onGoogleSignIn}
      forgotPasswordHref={forgotPasswordHref}
      siteKeySet={siteKeySet}
      footnote={footnote}
    />
  );
}
