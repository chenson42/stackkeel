"use client";

import { useState } from "react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";

// Shared change-password form (2026-09-05,
// docs/work-log/2026-09-05-account-menu-restructure.md). The one account
// capability more than one app has, so it is the one that gets a real shared
// component rather than a slot: a predecessor app had it as a standalone /change-
// password page, Portal as a section of /account, each with its own markup,
// its own copy, and its own error styling.
//
// Backend-agnostic by design — `onSubmit` lets a predecessor app post to its route
// handler and Portal call its server action, without this component knowing
// either exists. Errors render in the same inline boxed role="alert"
// treatment as CredentialsSignInForm, which is also what keeps this off the
// bare `text-destructive` pairing that fails WCAG AA at 3.37:1.

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordSectionProps {
  /** Returns an error message to display, or undefined/null on success. */
  onSubmit: (input: ChangePasswordInput) => Promise<{ error: string } | undefined | null | void>;
  /** Minimum length hint enforced client-side before calling onSubmit. */
  minLength?: number;
  /** Shown on success. */
  successMessage?: string;
}

export function ChangePasswordSection({
  onSubmit,
  minLength = 8,
  successMessage = "Password updated.",
}: ChangePasswordSectionProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (next !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (next.length < minLength) {
      setError(`Password must be at least ${minLength} characters.`);
      return;
    }

    setPending(true);
    try {
      const result = await onSubmit({
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      });
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setSuccess(successMessage);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="account-current-password">Current password</Label>
        <Input
          id="account-current-password"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="account-new-password">New password</Label>
        <Input
          id="account-new-password"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={minLength}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="account-confirm-password">Confirm new password</Label>
        <Input
          id="account-confirm-password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={minLength}
          autoComplete="new-password"
        />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground"
        >
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-muted-foreground">
          {success}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Updating…" : "Change password"}
      </Button>
    </form>
  );
}
