// Cross-app switcher primitive — types and pure helpers ONLY, deliberately
// split out of app-switcher.tsx's "use client" file.
//
// Why the split (learned the hard way in a predecessor codebase): Next.js
// treats every export of a "use client" file as a client-boundary
// reference, even a plain side-effect-free function. A Server Component
// (each app's own header wrapper) calling such a function throws at
// RUNTIME ("Attempted to call ... from the server") — not at typecheck or
// build time, because dynamic routes aren't exercised during `next build`.
// Keeping the pure logic in this plain module lets Server Components
// import and call it directly.
export type AppSwitcherAppId = "portal" | "admin";

export interface AppSwitcherTile {
  /** Which app this tile represents. Drives the fixed render order, the
   *  AppMark aria-label, and the internal name/accent lookup in
   *  app-switcher.tsx — NOT a caller-supplied label/color. */
  id: AppSwitcherAppId;
  /** Static, server-configured URL for this app's own top-level landing
   *  page (Portal `/home`, Admin `/`), or that app's own base URL for a
   *  sibling. Ignored when `current` is true — the current tile never
   *  navigates. Must always be literal, static, per-environment config
   *  (env var or hardcoded path) — never built from a query string,
   *  header, or any other request-derived value. */
  href: string;
  /** True for exactly the app currently being viewed. */
  current: boolean;
}

// One source of truth for "does the switcher have anything to show" —
// callable from a Server Component so headers can suppress the divider
// that would otherwise float with nothing to its left in the single-app
// case (e.g. after /personalize strips the admin app).
export function hasAppSwitcherSiblings(tiles: AppSwitcherTile[]): boolean {
  return tiles.some((t) => !t.current);
}

export interface AppSwitcherConfigEntry {
  name: string;
  accentColor: string;
}

// Literal hex accent colors, deliberately NOT var(--identity-500): a CSS
// custom property has exactly one resolved value per point in the cascade,
// which breaks when one page renders every app's tile simultaneously.
// Source of truth: BRANDING.md's tonal-scale guidance (the 500 step).
export const APP_SWITCHER_CONFIG: Record<AppSwitcherAppId, AppSwitcherConfigEntry> = {
  portal: { name: "PORTAL", accentColor: "#3b82f6" },
  admin: { name: "ADMIN", accentColor: "#8b5cf6" },
};
