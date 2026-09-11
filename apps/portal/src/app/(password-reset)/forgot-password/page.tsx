"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button, PageHeader } from "@repo/ui";
import { requestPasswordReset } from "../actions";
import { Turnstile } from "@/components/shared/turnstile";

const siteKeySet = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await requestPasswordReset({
        email: email.trim(),
        turnstileToken: turnstileToken || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        // Reset token so the widget refires a new challenge before the next attempt.
        setTurnstileToken("");
      } else {
        setIsSuccess(true);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <main className="mx-auto max-w-sm px-6 py-24">
        <div className="rounded-lg border border-border bg-background p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Check your email</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            If an account exists with that email address, a password reset link
            has been sent. The link expires in 60 minutes.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/signin"
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Back to sign in
            </Link>
            <Button
              type="button"
              onClick={() => {
                setIsSuccess(false);
                setEmail("");
              }}
              variant="link"
              className="h-auto p-0 font-normal text-muted-foreground hover:text-muted-foreground"
            >
              Try a different email
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <PageHeader
        title="Forgot password?"
        description="Enter your email address and we'll send you a reset link if an account exists."
      />

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="forgot-email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="forgot-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
            placeholder="you@example.com"
          />
        </div>
        <Turnstile
          onVerify={setTurnstileToken}
          onExpire={() => setTurnstileToken("")}
          onError={() => setTurnstileToken("")}
        />
        <Button
          type="submit"
          disabled={isSubmitting || (siteKeySet && !turnstileToken)}
          className="w-full rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        <Link
          href="/signin"
          className="underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
