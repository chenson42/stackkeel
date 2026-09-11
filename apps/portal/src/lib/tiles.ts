// Portal home tile registry — pure data (UX-PATTERNS § 3): zero session or
// query imports; a single colocated visibleTiles() applies the filter. A
// tile's isVisible MUST be the same check that gates the destination route
// (proxy.ts PROTECTION_RULES / the page's own guard) — tiles are hidden,
// never shown-then-denied, and this metadata must never become a second
// permission check.
import type { FeatureKey } from "@repo/permissions";

export interface PortalTile {
  id: string;
  label: string;
  description: string;
  href: string;
  /** Feature required to see the tile, or null for every signed-in user.
   *  Must equal the destination's own gate. */
  requiredFeature: FeatureKey | null;
  /** Render order — spaced by 10 so forks insert without renumbering. */
  order: number;
}

export const PORTAL_TILES: PortalTile[] = [
  // kit-module:whats-new-begin
  {
    id: "whats-new",
    label: "What's new",
    description: "Product updates and announcements.",
    href: "/whats-new",
    requiredFeature: null,
    order: 10,
  },
  // kit-module:whats-new-end
  // kit-module:feedback-begin
  {
    id: "feedback",
    label: "Feedback",
    description: "Tell us what's working and what isn't.",
    href: "/feedback",
    requiredFeature: null,
    order: 20,
  },
  // kit-module:feedback-end
  // kit-module:helpdesk-begin
  {
    id: "support",
    label: "Support",
    description: "File a ticket and follow it to resolution.",
    // Same check as proxy.ts's /support PROTECTION_RULES entry and the
    // page's own guard — tiles are hidden, never shown-then-denied.
    href: "/support",
    requiredFeature: "tickets.file",
    order: 30,
  },
  // kit-module:helpdesk-end
  {
    id: "account",
    label: "Account",
    description: "Profile, email, password, and two-factor settings.",
    href: "/account",
    requiredFeature: null,
    order: 40,
  },
];

export function visiblePortalTiles(features: string[] | undefined): PortalTile[] {
  return PORTAL_TILES.filter(
    (t) => t.requiredFeature === null || (features ?? []).includes(t.requiredFeature),
  ).sort((a, b) => a.order - b.order);
}
