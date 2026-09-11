import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

// Shared page-header primitive (2026-09-05). Consolidates TWO prior
// implementations:
//   1. ~45 hand-rolled `<h1> + <p className="mt-1 text-sm text-muted-
//      foreground">` copies spread across all three apps, and
//   2. one predecessor app's own local src/components/shared/page-header.tsx, which was
//      already shared *within* a predecessor app (28 pages) and carried a richer API
//      — an accent bar, and an optional item count next to the title.
// The richer treatment won: dropping the accent bar and count from 28 live
// pages to match the plainer copies would have been a downgrade, so those
// features moved here instead and every app gets them.
//
// The accent bar reads `--identity-500`, which all three apps define in
// their own globals.css (a predecessor app teal, Portal blue, Admin violet). That
// matches BRANDING.md's rule that per-app color belongs on chrome like "the
// top border of the app shell" — and replaces one predecessor app's hardcoded
// `var(--brand-blue)`, which was an a predecessor app-only legacy token no other app
// had.
//
// The description is hidden below the `sm` breakpoint (640px) per Chris's
// direction: on a phone the explanatory line under a screen title costs a
// chunk of the first viewport before the user reaches any real content, and
// the title plus surrounding UI already carry the context. It stays in the
// DOM rather than being conditionally rendered so screen readers still
// announce it — `hidden` only removes it visually — and doing it in CSS
// keeps this a Server Component with no client-side breakpoint check.
//
// NOTE: do not route transient state text ("Loading…", "Failed to load…")
// through `description`. It would be invisible on mobile, which turns a
// cosmetic rule into a functional regression.

const numberFormatter = new Intl.NumberFormat("en-US");

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Optional item count rendered beside the title (e.g. "· 1,204 participants"). */
  count?: number;
  /** Noun shown after `count`. Ignored when `count` is undefined. */
  countLabel?: string;
  /** Right-aligned slot for page-level actions (buttons, dialogs). */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  count,
  countLabel,
  actions,
  className,
}: PageHeaderProps) {
  const hasCount = typeof count === "number";

  return (
    <div
      className={cn(
        "relative flex flex-wrap items-end justify-between gap-4 border-b pb-4 pl-4",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-4 left-0 w-1 rounded-full bg-[var(--identity-500)]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold leading-none">{title}</h1>
          {hasCount && (
            <span className="text-sm text-muted-foreground">
              · {numberFormatter.format(count)}
              {countLabel ? ` ${countLabel}` : ""}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
