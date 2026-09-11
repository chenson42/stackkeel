import { hasRoleInApp } from "@repo/permissions";
import type { AppSwitcherTile } from "@repo/ui";

// Cross-app switcher (2026-09-04-cross-app-switcher, DECISION-059/060).
// Pure, DB-free, unit-testable — turns session.user.roles (already
// populated with every namespace's role names, zero new query) into the
// filtered tile list AppSwitcher renders. Filtering happens HERE, not in
// the client component, per DECISION-059's binding invariant #1 (the
// enumeration-risk finding from Phase 1's adversarial pass).
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || "http://localhost:3000/home";

export function getAppSwitcherTiles(roles: string[] | undefined): AppSwitcherTile[] {
  const tiles: AppSwitcherTile[] = [{ id: "admin", href: "/users", current: true }];
  if (hasRoleInApp(roles, "portal")) tiles.push({ id: "portal", href: PORTAL_URL, current: false });
  return tiles;
}
