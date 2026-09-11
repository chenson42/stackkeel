"use client";

// Shared second-step TOTP verification card. Matches the pattern all three
// apps' own TOTP step already used independently (6-digit code, auto-submit
// on complete, inline error, back-to-credentials link) as one component
// taking submission logic via props — see
// apps/portal/docs/work-log/2026-09-04-shared-login-component.md, Phase 3
// "packages/ui component contracts" for the authoritative contract this
// file implements.
//
// Corrected 2026-09-10 (apps/admin/docs/work-log/2026-09-10-2fa-input-and-
// app-labels.md, Defect 1). `acceptsRecoveryCode` used to gate MUTUALLY
// EXCLUSIVE renders: false -> the 6-slot InputOTP boxes; true -> a single
// free-text field, boxes gone entirely. That traded the everyday path (a
// TOTP code, entered on every sign-in) away for the rare one (a recovery
// code), for every app that turned recovery on. Chris's ruling: boxes are
// ALWAYS the default when `acceptsRecoveryCode` is true too — a "Use a
// recovery code instead" link swaps to the free-text field for the rare
// case, with a matching link back. `acceptsRecoveryCode=false` (one predecessor app's
// legacy /totp route, Admin's atomic sign-in) is unchanged: boxes only, no
// link, since there is nothing to hand off to.
//
// Paste is handled explicitly rather than left to InputOTP's own paste
// path (see `handleBoxesPaste` below) for two reasons verified directly
// against the installed input-otp@1.5.0 source
// (node_modules/.pnpm/input-otp@1.5.0.../dist/index.mjs) rather than
// assumed: (1) on non-iOS browsers (Chromium, which is all three apps'
// e2e target) with no `pasteTransformer` prop, InputOTP's own paste
// handler is a no-op — paste falls through to the native `onChange`, which
// slices to `maxLength` and rejects the whole paste if the sliced-down
// text fails `REGEXP_ONLY_DIGITS` (real, but has no path back to the
// recovery field, and produces no visible feedback that the paste "did
// nothing" — a recovery code just fails to appear); (2) InputOTP's `input`
// element does not intercept `onPaste` itself — a caller-supplied
// `onPaste` prop passes straight through to the underlying native input
// (`i.onPaste` in that library's source), so intercepting it here and
// calling `preventDefault()` synchronously during the same paste-event
// dispatch is enough to stop the native paste before InputOTP's own
// onChange ever sees it — confirmed live in apps/admin/e2e's paste spec
// (see this work-log's Phase 4 section for the exact dispatchEvent
// mechanics used to prove it, since Playwright has no OS clipboard by
// default).

import * as React from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { REGEXP_ONLY_DIGITS } from "input-otp";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../ui/input-otp";
import { AppBadge, type AppBadgeApp } from "../ui/app-badge";
import type { AuthFormResult } from "./types";

export interface TotpVerifyFormProps {
  app: AppBadgeApp;
  /** @default "Two-factor authentication" */
  title?: string;
  /** one predecessor app's existing helpful copy; Portal/Admin may omit. */
  description?: string;
  /** Already sanitized by the page. */
  callbackUrl: string;
  onSubmitTotp: (input: { code: string; callbackUrl: string }) => Promise<AuthFormResult>;
  /**
   * Whether a recovery code is a legitimate alternative to a TOTP code for
   * this call site. Does NOT change what renders first — the 6-slot boxes
   * are always the initial render. `true` additionally renders a "Use a
   * recovery code instead" link that swaps to a free-text field (and a
   * matching link back); `false` renders the boxes only, with no escape
   * hatch, because there is nothing to hand off to.
   *
   * Portal: true (real recovery-code enrollment exists). a predecessor app: true on
   * the atomic sign-in path (2026-09-08 increment added recovery-code
   * support), false on the legacy /totp route as of this file's own header
   * date (no behavior change there — boxes-only is what it already
   * rendered). Admin: false (no recovery-code enrollment exists yet).
   */
  acceptsRecoveryCode?: boolean;
  /** Omit ⇒ no back affordance (a predecessor app loses its in-place "Back" step post-convergence). */
  backHref?: string;
}

type Mode = "code" | "recovery";

// role="alert" + boxed treatment (UX-PATTERNS.md § 6) — never bare
// text-destructive on small text, which measures 3.37:1 against white and
// fails WCAG AA. Shared by both modes below so the two error renders can't
// drift from each other.
const ERROR_CLASSNAME =
  "rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground";

const LINK_CLASSNAME =
  "block w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline";

export function TotpVerifyForm({
  app,
  title = "Two-factor authentication",
  description,
  callbackUrl,
  onSubmitTotp,
  acceptsRecoveryCode = false,
  backHref,
}: TotpVerifyFormProps) {
  const [mode, setMode] = useState<Mode>("code");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Announced via the aria-live region below — "the mode change must be
  // announced" (a sighted user sees the field swap; a screen-reader user
  // needs to be told). Kept separate from `error`'s own role="alert",
  // which already announces itself and shouldn't double up with a second
  // live region fighting for the same moment.
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();
  const recoveryInputRef = useRef<HTMLInputElement>(null);
  const cardContentRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip the announcement (and the focus move) on mount — this effect
    // exists for a mode CHANGE, not the initial render, which already has
    // its own `autoFocus` on the boxes.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (mode === "recovery") {
      setAnnouncement("Switched to recovery code entry.");
      recoveryInputRef.current?.focus();
    } else {
      setAnnouncement("Switched to authenticator code entry.");
      // InputOTP (input-otp) renders its real, focusable <input> with a
      // data-input-otp attribute underneath the six visible slot divs —
      // querying for it here (rather than plumbing a ref through the
      // InputOTP/OTPInput forwardRef chain) matches how this repo's own
      // e2e specs already locate it (apps/admin/e2e/auth-and-admin-smoke.spec.ts,
      // a predecessor app/e2e/login.spec.ts's `[data-slot="input-otp"]`/
      // `[data-input-otp]` selectors).
      cardContentRef.current
        ?.querySelector<HTMLInputElement>("[data-input-otp]")
        ?.focus();
    }
  }, [mode]);

  function submit(codeOverride?: string) {
    const code = (codeOverride ?? value).trim();
    if (!code) return;
    if (mode === "code" && code.length < 6) return;

    setError(null);
    startTransition(async () => {
      const result = await onSubmitTotp({ code, callbackUrl });
      if (result?.error) {
        setValue("");
        setError(result.error);
      }
      // No result at all means onSubmitTotp completed its own redirect().
    });
  }

  function handleRecoverySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  function switchToRecovery(prefill = "") {
    setValue(prefill);
    setError(null);
    setMode("recovery");
  }

  function switchToCode() {
    setValue("");
    setError(null);
    setMode("code");
  }

  // Explicit paste handling — see this file's header comment for what was
  // verified against input-otp's own source and why relying on its default
  // paste path isn't enough here.
  function handleBoxesPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const trimmed = e.clipboardData.getData("text/plain").trim();
    if (!trimmed) return;

    if (/^\d+$/.test(trimmed) && trimmed.length <= 6) {
      // A clean numeric paste (whitespace tolerated by trim, unlike
      // InputOTP's own native path) — fill the boxes ourselves and
      // auto-submit on an exact 6-digit paste, same as typing the 6th
      // digit does via onComplete.
      e.preventDefault();
      setValue(trimmed);
      if (trimmed.length === 6) submit(trimmed);
      return;
    }

    if (acceptsRecoveryCode) {
      // Not a bare 6-digit code — most likely a recovery code (e.g.
      // `XXXX-XXXX`). Hand off to the recovery field instead of letting
      // InputOTP's own digit-only pattern silently reject it with no
      // feedback. Only when this call site actually has a recovery mode
      // to hand off to.
      e.preventDefault();
      switchToRecovery(trimmed);
    }
    // Otherwise (not digits, no recovery mode): let InputOTP's own paste
    // handling run — it will reject a non-digit paste via its pattern
    // check, same as it always has for a call site with no recovery
    // affordance at all.
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction>
          <AppBadge app={app} />
        </CardAction>
      </CardHeader>
      <CardContent ref={cardContentRef}>
        <div className="space-y-4">
          {/* Mode-change announcement only — errors announce themselves via
              role="alert" and would double up here. */}
          <span aria-live="polite" className="sr-only">
            {announcement}
          </span>

          {mode === "recovery" ? (
            <form onSubmit={handleRecoverySubmit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor={`${app}-totp-code`}>Recovery code</Label>
                <Input
                  id={`${app}-totp-code`}
                  name="token"
                  autoComplete="one-time-code"
                  required
                  ref={recoveryInputRef}
                  disabled={isPending}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="ABCD-EFGH"
                  className="text-center tracking-widest"
                />
              </div>
              {error && (
                <p role="alert" className={ERROR_CLASSNAME}>
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isPending || !value.trim()}>
                {isPending ? "Verifying…" : "Verify"}
              </Button>
            </form>
          ) : (
            <>
              <div className="space-y-3">
                <Label className="justify-center">Authenticator code</Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    pattern={REGEXP_ONLY_DIGITS}
                    value={value}
                    onChange={setValue}
                    onComplete={(code) => submit(code)}
                    onPaste={handleBoxesPaste}
                    autoComplete="one-time-code"
                    autoFocus
                    disabled={isPending}
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
                <p role="alert" className={ERROR_CLASSNAME}>
                  {error}
                </p>
              )}
              <Button
                type="button"
                className="w-full"
                disabled={isPending || value.length < 6}
                onClick={() => submit()}
              >
                {isPending ? "Verifying…" : "Verify"}
              </Button>
            </>
          )}

          {acceptsRecoveryCode && (
            <button
              type="button"
              onClick={() => (mode === "recovery" ? switchToCode() : switchToRecovery())}
              className={LINK_CLASSNAME}
            >
              {mode === "recovery" ? "Enter a 6-digit code instead" : "Use a recovery code instead"}
            </button>
          )}

          {backHref && (
            <Link href={backHref} className={LINK_CLASSNAME}>
              Back
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
