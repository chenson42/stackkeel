"use client";

/**
 * AppVersionGate — soft banner / hard block when the native build is behind
 * the admin-configured app_release_policy (module `mobile`). All decision
 * logic lives in version-gate-logic.ts (five fail-open paths, unit-tested).
 *
 * Soft banner: in-page, in-memory dismiss only. Hard block: AlertDialog with
 * no dismiss path by design (Escape/outside-click prevented) — the only exit
 * is updating, per the policy the operator set.
 */
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@repo/ui";
import { useAppVersionContext } from "./AppVersionProvider";
import { decideVersionGate } from "./version-gate-logic";

const IOS_APP_URL = process.env.NEXT_PUBLIC_IOS_APP_URL ?? "";
const ANDROID_APP_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL ?? "";

function ctaUrl(platform: string | null): string | null {
  if (platform === "ios") return IOS_APP_URL || null;
  if (platform === "android") return ANDROID_APP_URL || null;
  return null;
}

export function AppVersionGate() {
  const ctx = useAppVersionContext();
  const [dismissed, setDismissed] = useState(false);

  const decision = decideVersionGate(ctx?.updateCheckEnabled ?? false, ctx?.state ?? null);
  if (decision === "none") return null;

  const url = ctaUrl(ctx?.state?.platform ?? null);

  if (decision === "hard-block") {
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    return (
      <AlertDialog open>
        {/* Radix AlertDialog already blocks outside interaction (modal by
            design, no onInteractOutside prop); preventing Escape closes the
            last dismiss path. */}
        <AlertDialogContent onEscapeKeyDown={(e: KeyboardEvent) => e.preventDefault()}>
          <div className="mx-auto w-full max-w-sm space-y-4 text-center">
            <AlertDialogTitle className="text-2xl font-semibold tracking-tight">
              Time for a quick update
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This version of the app needs an update before you can continue.
            </AlertDialogDescription>
            {isOffline ? (
              <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                You&apos;re offline — reopen the app when you have a connection.
              </p>
            ) : url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Get the update
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">
                Contact your administrator to get the update.
              </p>
            )}
          </div>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (dismissed) return null;
  return (
    <div
      role="status"
      aria-label="App update available"
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 border-b bg-muted px-4 py-2"
    >
      <p className="flex-1 text-sm font-medium">A newer version of the app is available.</p>
      <div className="flex shrink-0 items-center gap-2">
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground"
          >
            Update
          </a>
        )}
        <button
          type="button"
          aria-label="Dismiss update banner"
          onClick={() => setDismissed(true)}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-background"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
