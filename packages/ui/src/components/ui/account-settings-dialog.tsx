"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { cn } from "../../lib/utils";

// Shared account-settings surface (2026-09-05,
// docs/work-log/2026-09-05-account-menu-restructure.md). Chris: "account
// settings should be shared" and "should be a sharable dialog that pops up"
// — replacing Portal's /account route as the entry point and giving a predecessor app
// and the admin app an account surface they never had.
//
// Deliberately a SHELL, not a fixed set of sections. The three apps support
// genuinely different things — Portal has profile/email/password/2FA/
// feedback/notifications, a predecessor app has password only, the admin app has
// nothing self-serve yet — so a hardcoded section list would render dead or
// missing UI in two of three apps. Each app passes the sections it actually
// has, the same prop-gated pattern CredentialsSignInForm uses for its
// Google/Turnstile/forgot-password slots.
//
// Imports no auth and owns no app logic: `open`/`onOpenChange` are driven by
// the host's own UserMenu.

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "?";
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return source[0]!.toUpperCase();
}

export interface AccountSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name?: string | null;
  email?: string | null;
  /** e.g. one predecessor app's role displayName. Rendered under the email when present. */
  roleLabel?: string | null;
  /** App-supplied sections — compose with <AccountSection>. */
  children?: ReactNode;
}

export function AccountSettingsDialog({
  open,
  onOpenChange,
  name,
  email,
  roleLabel,
  children,
}: AccountSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Account settings</DialogTitle>
          <DialogDescription className="sr-only">
            View your account details and manage your sign-in settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-medium"
          >
            {initials(name, email)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name || "Your account"}</p>
            {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
            {roleLabel && (
              <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
            )}
          </div>
        </div>

        {children}
      </DialogContent>
    </Dialog>
  );
}

export interface AccountSectionProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Titled section wrapper so every app's sections stack identically. */
export function AccountSection({
  title,
  description,
  children,
  className,
}: AccountSectionProps) {
  return (
    <section className={cn("border-t border-border pt-4", className)}>
      <h3 className="text-sm font-medium">{title}</h3>
      {description && (
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}
