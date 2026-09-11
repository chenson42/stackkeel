"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { BackLink, Button, PageHeader } from "@repo/ui";
import { acknowledgeEnrollment, completeEnrollment } from "./actions";

// Increment 2 of the 2FA consolidation (2026-09-07) — the remount fix, as
// actually verified against a real dev server.
//
// The original design (this work-log's Phase 3) called acknowledgeEnrollment()
// from a useEffect keyed on `enrolled`, on the theory that firing it AFTER
// the codes screen had already committed and painted would let the eventual
// remount replace content the user had already seen rather than pre-empt
// it. Real e2e proved this insufficient: apps/portal/e2e/account-page.spec.ts's
// enrolled-state test, run against `npm run dev` and real Postgres, found
// the management view already rendered by the time Playwright's FIRST poll
// ran (chromium: locator resolved to 0 code elements; firefox/webkit: the
// Continue link was detached from the DOM mid-click). useEffect fires close
// enough to the same tick as the commit that a fast local round trip
// (revalidatePath + the RSC refetch) can complete and swap the tree before
// any observer — Playwright or a real user's eye — reliably registers the
// codes screen. The reordering was real progress (the codes DO get one
// paint now, unlike before), but "one paint, possibly milliseconds long" is
// not the same guarantee as "the user has seen them."
//
// Fix: acknowledgeEnrollment() fires from the Continue button's own click
// handler instead of an automatic effect. Nothing triggers the RSC refresh
// until the user has actively read the codes and clicked through — the same
// contract a predecessor app's own MfaSetupForm uses (its handleContinue() likewise
// defers the session update / navigation to an explicit click). This closes
// the race structurally rather than by timing.

interface TotpEnrollFormProps {
  uri: string;
  secret: string;
  pendingTtlMinutes: number;
  callbackUrl?: string;
}

export function TotpEnrollForm({
  uri,
  secret,
  pendingTtlMinutes,
  callbackUrl,
}: TotpEnrollFormProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [continuing, setContinuing] = useState(false);

  // Generate QR code client-side from the otpauth URI
  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(uri).then((url) => {
        if (!cancelled) setQrDataUrl(url);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      toast.error("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setPending(true);
    const result = await completeEnrollment({ code });
    setPending(false);
    if (result.ok && result.data) {
      setEnrolled(true);
      setRecoveryCodes(result.data.recoveryCodes);
    } else if (!result.ok) {
      toast.error(result.error);
    }
  }

  async function handleContinue() {
    setContinuing(true);
    await acknowledgeEnrollment();
    window.location.href = callbackUrl ?? "/home";
  }

  if (enrolled) {
    return (
      <div className="max-w-xl">
        <div className="mb-6">
          <BackLink href="/home" label="Back to Home" />
        </div>
        <PageHeader
          title="Two-factor authentication enabled"
          description="Your authenticator app is now linked. Save your recovery codes below — this is the only time they will be shown in plaintext."
        />
        <div className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            Recovery codes — save these now
          </h2>
          <p className="mt-1 text-xs">
            Each code lets you sign in once if you lose your authenticator.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
            {recoveryCodes.map((c) => (
              <li key={c} className="rounded bg-background px-2 py-1">
                {c}
              </li>
            ))}
          </ul>
        </div>
        <Button
          type="button"
          disabled={continuing}
          onClick={handleContinue}
          className="mt-6"
        >
          {continuing ? "Continuing…" : "Continue"}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <BackLink href="/home" label="Back to Home" />
      </div>
      <PageHeader title="Enroll in two-factor authentication" />
      <ol className="mt-4 space-y-2 text-sm">
        <li>1. Install an authenticator app (Google Authenticator, 1Password, Authy).</li>
        <li>2. Scan this QR code:</li>
      </ol>

      {qrDataUrl ? (
        <Image
          src={qrDataUrl}
          alt="TOTP QR code — scan with your authenticator app"
          width={192}
          height={192}
          className="mt-4 rounded border border-border bg-white p-2"
          unoptimized
        />
      ) : (
        <div className="mt-4 h-48 w-48 rounded border border-border bg-muted" />
      )}

      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          Can&apos;t scan? Enter manually
        </summary>
        <pre className="mt-2 rounded bg-muted p-2 font-mono">{secret}</pre>
      </details>
      <p className="mt-2 text-xs text-muted-foreground">
        This QR code expires in {pendingTtlMinutes} minutes. Reload the page for
        a fresh one.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <label className="block text-sm font-medium">
          Enter the 6-digit code from your app
        </label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          required
          // The /totp verification screen focuses its input; this enrollment
          // form did not, so the first 2FA screen a person meets made them
          // click before typing while the second behaved correctly.
          autoFocus
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base tracking-widest"
          placeholder="123456"
        />
        <Button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground text-background hover:bg-foreground/90"
        >
          {pending ? "Verifying…" : "Confirm enrollment"}
        </Button>
      </form>
    </div>
  );
}
