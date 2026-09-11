"use client";

import Link from "next/link";
import { Button } from "./button";

// Promoted 2026-09-07 (apps/portal/docs/work-log/2026-09-07-account-settings-audit.md
// Phase 3) from Portal's inline account-settings-content.tsx markup — all
// three apps need the identical status-line + button shape, per
// UX-PATTERNS § 1. two predecessor apps both had NO working 2FA entry point
// in their account dialog before this; Portal's `/account/2fa` is the
// reference management route the other two don't have yet (see
// `manageHref` below).
export interface TwoFactorStatusSectionProps {
  /** Whether the signed-in user currently has TOTP enrolled. Source per app:
   *  predecessor apps — `session.user.hasTotp` (JWT claim, no DB round trip).
   *  Portal — `data.isEnrolledInTotp` from the existing account-overview
   *  fetch (unchanged; do not add a second session read for this). */
  enrolled: boolean;
  /** Where "Set up" sends an unenrolled user. Always required — every app
   *  has a working first-time enrollment route today. */
  setupHref: string;
  /** Where "Manage" sends an enrolled user (rotate factor, view/regenerate
   *  recovery codes). Omit when the app has no working management view yet:
   *  the section then shows status text only, with no button, rather than
   *  linking to a page that cannot succeed for an already-enrolled user.
   *  two predecessor apps omit this today (see the work-log's Phase 3 § 4);
   *  their split-off work-logs thread a real value in once their management
   *  view ships, with no change required to this component. Portal passes
   *  the same href as `setupHref` — its `/account/2fa` is one route that
   *  branches internally on enrollment state, not two routes. */
  manageHref?: string;
}

export function TwoFactorStatusSection({
  enrolled,
  setupHref,
  manageHref,
}: TwoFactorStatusSectionProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">
        {enrolled
          ? manageHref
            ? "Enabled"
            : "Enabled — management tools are coming soon"
          : "Not enabled"}
      </span>
      {enrolled ? (
        manageHref && (
          <Button asChild variant="outline" size="sm">
            <Link href={manageHref}>Manage</Link>
          </Button>
        )
      ) : (
        <Button asChild variant="outline" size="sm">
          <Link href={setupHref}>Set up</Link>
        </Button>
      )}
    </div>
  );
}
