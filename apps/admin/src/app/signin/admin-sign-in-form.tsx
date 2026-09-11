"use client";

import { useState } from "react";
import { CredentialsSignInForm, TotpVerifyForm, type AuthFormResult } from "@repo/ui";
import { signInWithCredentials, signInWithGoogle } from "./actions";

interface Props {
  callbackUrl: string;
  googleLoginEnabled: boolean;
  initialError?: string;
}

type Step = "credentials" | "totp";

/**
 * 2026-09-04 (Increment C, 2026-09-04-shared-login-component.md) — converges
 * this app's sign-in UI onto the shared @repo/ui components while
 * deliberately KEEPING Admin's atomic authorize() security check
 * (docs/work-log/2026-09-04-totp-per-login-gap.md, shipped earlier the same
 * day) intact. This is a considered architectural call, not an oversight:
 *
 * Phase 3 of 2026-09-04-shared-login-component.md designed CredentialsSignInForm/
 * TotpVerifyForm around the separate-route model (Portal's shape) — a
 * session is issued at password time, and TotpVerifyForm's onSubmitTotp
 * only takes `{code, callbackUrl}` because it re-verifies an ALREADY-ISSUED
 * session. That contract does not fit Admin's atomic model, where NO
 * session exists until a correct TOTP code (for enrolled users) is
 * submitted alongside the original credentials to the very same
 * authorize() call. Retiring the atomic check to force Admin onto the
 * separate-route model was explicitly ruled out for this pass (the atomic
 * check is simpler, already shipped, and already verified safe today;
 * Phase 3 itself only sketched Admin's separate-route conversion as a
 * *future* Increment C, written before the urgent fix existed).
 *
 * The resolution: this small client-side wrapper — mirroring
 * apps/portal/src/app/(auth)/signin/portal-credentials-sign-in-form.tsx's
 * own "thin per-app glue component composes the shared pieces" precedent —
 * holds the two-step state locally (matching a predecessor app's PRE-convergence
 * login-form.tsx shape, and Admin's own pre-Increment-C
 * SignInCredentialsForm shape) and re-submits the closed-over email/
 * password together with the TOTP code on step 2, so `signInWithCredentials`
 * / `authorize()` never has to change. Both CredentialsSignInFormProps and
 * TotpVerifyFormProps are consumed EXACTLY as shipped in Increment A/B — no
 * change to the shared contracts, so Portal's and any future a predecessor app
 * integration are unaffected.
 *
 * `backHref` is intentionally omitted from the TotpVerifyForm below: the
 * shared component only supports a `next/link`-style navigation for "back,"
 * not a local state-reset callback, and this flow's "back" is a step-state
 * reset, not a navigation. This is the same accepted, disclosed small UX
 * regression Phase 3 already named for a predecessor app's own convergence ("a predecessor app
 * loses its in-place Back affordance... a named, accepted small UX
 * regression, not silently dropped") — Admin's pre-Increment-C WIP form had
 * a Back button; it does not survive this pass. Not blocking a security fix
 * increment; flagged in the work-log as a disclosed trade-off.
 */
export function AdminSignInForm({ callbackUrl, googleLoginEnabled, initialError }: Props) {
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleCredentialsSubmit(input: {
    email: string;
    password: string;
    callbackUrl: string;
  }): Promise<AuthFormResult> {
    const result = await signInWithCredentials({
      email: input.email,
      password: input.password,
      callbackUrl: input.callbackUrl,
    });
    if (result && "mfaRequired" in result) {
      // Correct password, TOTP enrolled, no code submitted yet — NOT a
      // failed login. Stash the credentials (never sent anywhere but back
      // to this same authorize() call on step 2) and swap to the TOTP step.
      setEmail(input.email);
      setPassword(input.password);
      setStep("totp");
      return undefined;
    }
    if (result && "error" in result) {
      return { error: result.error };
    }
    // No result at all means signInWithCredentials() completed its own
    // redirect() — nothing left to do here.
    return undefined;
  }

  async function handleTotpSubmit(input: { code: string; callbackUrl: string }): Promise<AuthFormResult> {
    const result = await signInWithCredentials({
      email,
      password,
      totpCode: input.code,
      callbackUrl: input.callbackUrl,
    });
    if (result && "error" in result) {
      return { error: result.error };
    }
    if (result && "mfaRequired" in result) {
      // Should not happen (a code was just submitted) — surface as an
      // error rather than silently looping.
      return { error: "Invalid authentication code. Please try again." };
    }
    return undefined;
  }

  async function handleGoogleSignIn() {
    await signInWithGoogle(callbackUrl);
  }

  if (step === "totp") {
    return (
      <TotpVerifyForm
        app="admin"
        description="Enter the 6-digit code from your authenticator app. Codes refresh every 30 seconds — use the code shown right now."
        callbackUrl={callbackUrl}
        onSubmitTotp={handleTotpSubmit}
      />
    );
  }

  return (
    <CredentialsSignInForm
      app="admin"
      description="Sign in to Admin."
      callbackUrl={callbackUrl}
      initialError={initialError}
      onSubmitCredentials={handleCredentialsSubmit}
      onGoogleSignIn={googleLoginEnabled ? handleGoogleSignIn : undefined}
    />
  );
}
