// Cross-platform design tokens — plain TS values consumable by web CSS
// (packages/ui/src/theme.css mirrors these) AND React Native StyleSheets
// (apps/mobile), which cannot parse CSS custom properties.
//
// Source-of-truth rule: when brand values change (i.e. /personalize runs
// `pnpm brand:generate`), BOTH this file and packages/ui/src/theme.css are
// regenerated together — they are two projections of one palette, and the
// generator (Phase 3) owns keeping them in lockstep. Hex values are
// pre-resolved at definition time so RN needs no color-parsing step.

/** "Starter Blue" placeholder brand ramp — BRANDING.md step semantics. */
export const colors = {
  brand: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    500: "#3b82f6",
    700: "#1d4ed8",
    900: "#1e3a8a",
  },
  background: "#ffffff",
  foreground: "#1f2733",
  muted: "#f7f8fa",
  mutedFg: "#5b6472",
  border: "#e7eaee",
  destructive: "#dc2626",
  success: "#15803d",
  warning: "#b45309",
} as const;

/** Independently-derived dark scheme (not an inversion — see theme.css). */
export const darkColors = {
  background: "#0e141c",
  foreground: "#e3e8ef",
  muted: "#161d27",
  mutedFg: "#97a1af",
  border: "#273140",
  brand500: "#60a5fa",
} as const;

/** Type scale in sp — RN fontSize units; matches Tailwind's rem scale. */
export const typography = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
} as const;

/** Spacing in dp — matches Tailwind's 4px grid. */
export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  full: 9999,
} as const;
