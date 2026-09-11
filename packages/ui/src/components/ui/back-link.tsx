import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "../../lib/utils";

// Shared back-navigation primitive (2026-09-07-back-nav-and-shell-consistency,
// Phase 2/3, Increment 1). Consolidates fifteen call sites across all three
// apps — 10 already-shipped hand-rolled copies (which had already drifted
// into four spellings of one icon className: `h-4 w-4 mr-2`, `h-4 w-4 mr-1`,
// `mr-1 h-4 w-4`, and a bare `h-4 w-4`) plus 5 pages missing a back link
// entirely. Same shared-first logic as the `PageHeader` promotion
// (UX-PATTERNS.md § 1) — see that component's own header for the identical
// precedent this one follows.
//
// Server Component, deliberately — `PageHeader` has no "use client" either,
// and `"use client"` is a module-level directive: adding it here would force
// every one of the fifteen consumers into the client boundary even though
// only 2 (Portal's guarded-back-button pages) actually need one. Those 2
// pages compose their own local `GuardedBackButton` instead of using this
// component directly — see that app's own back-nav call sites.
//
// Presentational only, matching `PageHeader`'s own contract (title/description
// as plain ReactNode, no data fetching): `href` and `label` are both fully
// resolved by the caller before this component ever sees them. This
// component does not read `searchParams`, does not validate a prefix
// allowlist, and does not know any app's routes — that logic lives in
// `resolveBackLink` (`../../lib/back-link`), which takes the per-app
// prefix→label table as a parameter instead of hardcoding one here.
//
// `label` is the FULL rendered string ("Back to Participants"), not a bare
// destination name this component prefixes with "Back to" itself — the
// already-shipped copy disagreed on capitalization and phrasing before this
// promotion (`Back to Users` vs `Back to projects` vs a bare app-home
// destination), and baking in a template would just mean adding an escape
// hatch on day one.

export interface BackLinkProps {
  /** Caller has already validated this against its own allowlist (or it's a
   *  hardcoded fixed-origin href — see UI-STANDARDS.md § Back Navigation
   *  "Pages with a fixed origin"). BackLink does no validation of its own. */
  href: string;
  /** Full rendered string, e.g. "Back to Participants" — not a bare
   *  destination name. BackLink does not prepend "Back to " itself. */
  label: string;
  className?: string;
}

export function BackLink({ href, label, className }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center text-sm text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4 mr-1" />
      {label}
    </Link>
  );
}
