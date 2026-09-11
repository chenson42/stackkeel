import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * Status pill — shared across the admin app, Portal, and a predecessor app.
 *
 * Chris, 2026-09-05: *"pills are ugly colors in the admin app in the users
 * table."* They were raw Tailwind defaults — `bg-emerald-100 text-emerald-800`
 * and `bg-amber-100 text-amber-800`, with `emerald-900`/`amber-900` in dark
 * mode. Those hues appear nowhere in BRANDING.md, which is explicit that
 * status colors are a shared, fixed set (coral and gold) and that components
 * should not carry raw color values.
 *
 * TWO THINGS THIS FIXES, and the second is not cosmetic:
 *
 * 1. The colours are now the brand's own status colours, drawn from tokens.
 * 2. **The colour is no longer load-bearing for legibility.** The old pills
 *    set small text in a saturated hue on a tinted ground of the same hue.
 *    BRANDING.md's Contrast section and UX-PATTERNS §6 both say the same
 *    thing: `--destructive` measures 3.37:1 against white and fails WCAG AA
 *    for small text, which is exactly why the boxed/tinted treatment exists.
 *    So here the TEXT is always `--foreground` (which passes comfortably) and
 *    the status is carried by a tinted background, a matching border, and a
 *    solid dot. Colour becomes redundant reinforcement rather than the only
 *    signal — which also helps anyone who cannot distinguish the hues.
 *
 * Variants are named for MEANING, not colour, so a caller cannot ask for
 * "the green one" and quietly re-introduce a palette decision at the call
 * site. Mapping meaning → hue is this component's job alone.
 */
export type StatusPillVariant = "active" | "pending" | "attention" | "neutral";

const VARIANT_CLASSES: Record<StatusPillVariant, { wrap: string; dot: string }> = {
  // The AA-tuned --accent rather than a brighter
  // wordmark green (see theme.css's own note on why those differ).
  active: {
    wrap: "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]",
    dot: "bg-[var(--accent)]",
  },
  // Brand gold — BRANDING.md's designated warning/pending status colour.
  pending: {
    wrap: "border-[color-mix(in_srgb,var(--brand-yellow)_55%,transparent)] bg-[color-mix(in_srgb,var(--brand-yellow)_25%,transparent)]",
    dot: "bg-[var(--brand-yellow)]",
  },
  // Brand coral — BRANDING.md's designated urgent/overdue status colour.
  attention: {
    wrap: "border-[color-mix(in_srgb,var(--brand-coral)_35%,transparent)] bg-[color-mix(in_srgb,var(--brand-coral)_12%,transparent)]",
    dot: "bg-[var(--brand-coral)]",
  },
  neutral: {
    wrap: "border-border bg-muted",
    dot: "bg-[var(--muted-foreground)]",
  },
};

export function StatusPill({
  variant = "neutral",
  children,
  className,
}: {
  variant?: StatusPillVariant;
  children: React.ReactNode;
  className?: string;
}) {
  const v = VARIANT_CLASSES[variant];
  return (
    <span
      className={cn(
        "text-foreground inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        v.wrap,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", v.dot)} />
      {children}
    </span>
  );
}
