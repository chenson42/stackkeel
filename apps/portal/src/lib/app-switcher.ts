import { hasRoleInApp } from "@repo/permissions";
import type { AppSwitcherTile } from "@repo/ui";

// Cross-app switcher (2026-09-04-cross-app-switcher, DECISION-059/060).
// Pure, DB-free, unit-testable — turns session.user.roles (already
// populated with every namespace's role names, zero new query) into the
// filtered tile list AppSwitcher renders. Filtering happens HERE, not in
// the client component, per DECISION-059's binding invariant #1 (the
// enumeration-risk finding from Phase 1's adversarial pass).
//
// ONE helper, TWO call sites — GlobalNav (member shell) and
// (admin)/admin/layout.tsx both import this, so the filtering logic exists
// exactly once in Portal despite Portal being the only app with two header
// render locations (Phase 3 API/Props Contract).
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3001";

export function getAppSwitcherTiles(roles: string[] | undefined): AppSwitcherTile[] {
  const tiles: AppSwitcherTile[] = [{ id: "portal", href: "/home", current: true }];
  if (hasRoleInApp(roles, "admin")) tiles.push({ id: "admin", href: ADMIN_URL, current: false });
  return tiles;
}
