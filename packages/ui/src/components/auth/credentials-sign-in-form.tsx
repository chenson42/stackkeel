"use client";

// Shared credentials sign-in card, absorbing every real per-app difference
// Phase 1 found (Google OAuth, Turnstile CAPTCHA, forgot-password) as
// prop-gated slots — never an app-name branch baked into this component.
// See apps/portal/docs/work-log/2026-09-04-shared-login-component.md,
// Phase 3 "packages/ui component contracts" for the authoritative contract
// this file implements.
//
// Deliberately does NOT own a TOTP step. Phase 2 ratified the server-action
// + separate-route model (Portal's/Admin's target shape) for all three
// apps — credentials submission either succeeds (the caller's own server
// action resolves the real destination and calls redirect() itself) or
// fails with a human-readable error. There is no "MFA_REQUIRED" signal in
// AuthFormResult by design: that step lives entirely in TotpVerifyForm, on
// its own route, consuming its own onSubmitTotp prop.
//
// "use server" action refs (onSubmitCredentials, onGoogleSignIn) and the
// actual FEATURES/session-shaped logic behind them stay app-specific per
// Phase 2's explicit ruling — this component only ever calls what it's
// given and renders the result.

import * as React from "react";
import { useState, useTransition } from "react";
import Link from "next/link";

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
import { AppBadge, type AppBadgeApp } from "../ui/app-badge";
import type { AuthFormResult } from "./types";

export interface CredentialsSignInFormProps {
  app: AppBadgeApp;
  /** @default "Sign in" */
  title?: string;
  description: string;
  /** Already sanitized by the page (server-side, via @repo/auth's sanitizeCallbackUrl). */
  callbackUrl: string;
  /** Page-level banner text (e.g. "This account has been deactivated."). Distinct from a submit-time error. */
  initialError?: string;
  onSubmitCredentials: (input: {
    email: string;
    password: string;
    turnstileToken?: string;
    callbackUrl: string;
  }) => Promise<AuthFormResult>;
  /** e.g. "you@example.com"; omit to render no placeholder. */
  emailPlaceholder?: string;
  /** "use server" action ref. Omit ⇒ no Google button, no divider. */
  onGoogleSignIn?: () => Promise<void>;
  /** Omit ⇒ no link (a predecessor app/Admin today). */
  forgotPasswordHref?: string;
  captcha?: {
    siteKeySet: boolean;
    /**
     * packages/ui never imports Turnstile itself — the caller renders its
     * own widget into this slot and reports back through the callbacks.
     */
    render: (slot: {
      onVerify: (token: string) => void;
      onExpire: () => void;
      onError: () => void;
    }) => React.ReactNode;
  };
  /** e.g. Portal's "First time? Run npm run db:seed..." hint. */
  footnote?: React.ReactNode;
}

export function CredentialsSignInForm({
  app,
  title = "Sign in",
  description,
  callbackUrl,
  initialError,
  onSubmitCredentials,
  emailPlaceholder,
  onGoogleSignIn,
  forgotPasswordHref,
  captcha,
  footnote,
}: CredentialsSignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [isPending, startTransition] = useTransition();

  const submitDisabled =
    !email || !password || (captcha?.siteKeySet && !turnstileToken) || isPending;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onSubmitCredentials({
        email,
        password,
        turnstileToken: turnstileToken || undefined,
        callbackUrl,
      });
      if (result?.error) {
        setError(result.error);
        // Blank the token so a CAPTCHA widget refires a new challenge
        // before the next submission attempt (mirrors Portal's existing
        // behavior — harmless no-op when captcha is absent).
        setTurnstileToken("");
      }
      // No result at all means onSubmitCredentials completed its own
      // redirect() — nothing left to do here.
    });
  }

  function handleGoogleSignIn() {
    startTransition(async () => {
      await onGoogleSignIn?.();
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <AppBadge app={app} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground"
          >
            {error}
          </p>
        )}

        {onGoogleSignIn && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={isPending}
              className="w-full"
            >
              Sign in with Google
            </Button>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${app}-signin-email`}>Email</Label>
            <Input
              id={`${app}-signin-email`}
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              placeholder={emailPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${app}-signin-password`}>Password</Label>
            <Input
              id={`${app}-signin-password`}
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
            />
          </div>

          {captcha &&
            captcha.render({
              onVerify: setTurnstileToken,
              onExpire: () => setTurnstileToken(""),
              onError: () => setTurnstileToken(""),
            })}

          <Button type="submit" className="w-full" disabled={submitDisabled}>
            {isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {forgotPasswordHref && (
          <div className="mt-4 text-right">
            <Link
              href={forgotPasswordHref}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        )}

        {footnote && <div className="mt-4 text-xs text-muted-foreground">{footnote}</div>}
      </CardContent>
    </Card>
  );
}
