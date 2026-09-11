"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@repo/ui";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { acknowledgeTotpEnrollmentAction, completeTotpEnrollmentAction } from "./actions";

interface Props {
  qrCodeDataUrl: string;
  secret: string;
  callbackUrl: string;
}

export function MfaSetupForm({ qrCodeDataUrl, secret, callbackUrl }: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [continuing, setContinuing] = useState(false);

  async function handleSubmit(codeValue?: string) {
    const submitCode = codeValue ?? code;
    if (submitCode.length < 6) return;
    setError(null);
    setLoading(true);
    const result = await completeTotpEnrollmentAction({ code: submitCode });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRecoveryCodes(result.data?.recoveryCodes ?? []);
  }

  // Increment 2 of the 2FA consolidation (2026-09-07) — fired only here,
  // after the user has read their codes, not inside completeTotpEnrollmentAction
  // itself. See that action's own header for the exact bug this closes: it
  // used to call unstable_update({}) right after the DB writes, which
  // (because it writes the session cookie) triggers Next's automatic
  // post-Server-Action route refresh — and once page.tsx's hasTotp guard
  // existed, that refresh swapped in the "Already enrolled" branch before
  // this component's own recoveryCodes state was ever seen. Same fix shape
  // as Portal's acknowledgeEnrollment()/a predecessor app's click-triggered
  // handleContinue().
  async function handleContinue() {
    setContinuing(true);
    await acknowledgeTotpEnrollmentAction();
    router.push(callbackUrl);
  }

  if (recoveryCodes) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Save your recovery codes</CardTitle>
          <CardDescription>
            Store these somewhere safe — each code can be used once if you lose access to your
            authenticator app. This is the only time they&apos;re shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted p-3 font-mono text-sm">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Button className="mt-4 w-full" disabled={continuing} onClick={handleContinue}>
            {continuing ? "Continuing…" : "Continue"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Set up two-factor authentication</CardTitle>
        <CardDescription>
          Admin requires 2FA for every account. Scan this QR code with an authenticator
          app (Google Authenticator, Authy, or any TOTP-compatible app), then enter the 6-digit
          code it shows.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCodeDataUrl} alt="TOTP QR code" width={200} height={200} />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Can&apos;t scan? Enter this key manually: <code className="font-mono">{secret}</code>
          </p>
          <div className="space-y-3">
            <label className="block text-center text-sm font-medium">Verification code</label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                value={code}
                onChange={setCode}
                onComplete={handleSubmit}
                autoComplete="one-time-code"
                // Matches packages/ui's TotpVerifyForm, which focuses its first
                // slot; this enrollment form did not.
                autoFocus
                disabled={loading}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
              {error}
            </p>
          )}
          <Button
            type="button"
            disabled={loading || code.length < 6}
            className="w-full"
            onClick={() => handleSubmit()}
          >
            {loading ? "Verifying…" : "Verify & enable 2FA"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
