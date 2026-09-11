"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { LayoutGrid, Check } from "lucide-react";
import { AppMark, type AppMarkApp } from "./app-mark";
import { cn } from "../../lib/utils";
import {
  hasAppSwitcherSiblings,
  APP_SWITCHER_CONFIG,
  type AppSwitcherAppId,
  type AppSwitcherTile,
  type AppSwitcherConfigEntry,
} from "./app-switcher-types";

// AppSwitcherAppId/AppSwitcherTile/hasAppSwitcherSiblings/APP_SWITCHER_CONFIG
// now live in the sibling app-switcher-types.ts (no "use client") so a
// Server Component can import them directly — see that file's header
// comment for the RSC-boundary bug this split fixes (APP_SWITCHER_CONFIG
// joined the move 2026-09-10, apps/admin/docs/work-log/2026-09-10-2fa-
// input-and-app-labels.md Defect 2 — ADMIN's /roles page is exactly such a
// Server Component consumer, and was hardcoding its own drifted copy of
// these names instead). Re-exported here for backward compatibility with
// existing `import { type AppSwitcherTile } from "./app-switcher"` call
// sites; packages/ui/src/index.ts now points at app-switcher-types.ts
// directly for the non-component exports.
export type { AppSwitcherAppId, AppSwitcherTile, AppSwitcherConfigEntry };
export { APP_SWITCHER_CONFIG };

// Cross-app switcher primitive (2026-09-04-cross-app-switcher,
// DECISION-059/060). Auth-blind by construction, same binding condition as
// SidebarNav (DECISION-056 point 3): this component receives an
// already-computed, already-filtered `tiles` prop and manages only its own
// open/closed panel state. It never imports auth()/cachedAuth()/
// hasFeature()/hasRoleInApp() and never calls redirect() — filtering happens
// exclusively in each app's server-side wrapper (apps/*/src/lib/app-switcher.ts)
// before props ever reach this file. Rendering all three tiles and hiding
// ineligible ones client-side would leak the existence of an app a user has
// no role in (Phase 1's own adversarial pass) — this component structurally
// cannot do that because it never sees an unfiltered list.
//
// Deliberately narrower than DECISION-059 ruling 5's original sketch
// (`{ app, name, href, accentColor }`): `name`/`accentColor` are NOT
// caller-supplied props. They live in the APP_SWITCHER_CONFIG map imported
// above (app-switcher-types.ts), mirroring app-badge.tsx's own
// APP_BADGE_CONFIG id->metadata lookup.
// Two reasons, both from Phase 3's API/Props Contract:
//   1. Closes the DECISION-058 icon-serialization trap structurally, not
//      conventionally — there is no icon prop to get wrong. AppSwitcher
//      always renders <AppMark app={tile.id} />, resolved internally
//      from the plain `id` string already on the tile.
//   2. Name and accent color are cross-app-wide identity constants
//      (BRANDING.md / DECISION-060), not per-render data — hardcoding them
//      once here means three wrappers don't each need their own copy to
//      typo or drift.

export interface AppSwitcherProps {
  tiles: AppSwitcherTile[];
  className?: string;
}

// APP_SWITCHER_CONFIG (name/accentColor per app) now lives in
// app-switcher-types.ts, imported above — see that file for the literal-hex
// reasoning (a CSS custom property has exactly one resolved value per point
// in the cascade, which breaks when this component renders every app's tile
// simultaneously on one page) and BRANDING.md's "Full tonal scale" table for
// the source of truth those hex values must track.

const RENDER_ORDER: AppSwitcherAppId[] = ["portal", "admin"];

function sortTiles(tiles: AppSwitcherTile[]): AppSwitcherTile[] {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  return RENDER_ORDER.map((id) => byId.get(id)).filter(
    (t): t is AppSwitcherTile => t !== undefined,
  );
}

// Viewport edge padding kept between the panel and the screen's left/right
// edges, in px. Also the panel's own top-to-trigger gap (matches the
// previous `mt-2` = 8px).
const VIEWPORT_MARGIN = 8;

export function AppSwitcher({ tiles, className }: AppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const ordered = sortTiles(tiles);

  // Degenerate single-app case (Phase 1 Flow 4 / Phase 3 API Contract): if
  // the only tile is the current app, there is nothing to switch to — no
  // waffle trigger renders at all, mirroring SidebarNav's own
  // empty-filtered-list-renders-null precedent. Wrappers don't special-case
  // this themselves; AppSwitcher decides visibility of the whole control.
  // (Callers needing to know this ahead of render — e.g. to suppress an
  // adjacent divider — use the exported hasAppSwitcherSiblings() above,
  // which this is kept identical to.)
  const hasSiblings = hasAppSwitcherSiblings(ordered);

  // Viewport-aware positioning (mobile-overflow fix, 2026-09-04 Phase 4
  // loop-back — see docs/work-log/2026-09-04-cross-app-switcher.md). The
  // panel used to be `absolute top-full left-0`, anchored to the trigger's
  // own position within its `relative` container — fine on wide screens,
  // but every header call site sits the trigger ~64px in from the screen
  // edge (after a hamburger/sidebar-toggle icon), so a fixed 320px-wide
  // panel anchored flush-left of the trigger runs off the right edge of
  // any viewport narrower than roughly 64 + 320 = 384px. `position: fixed`
  // computed from the trigger's own `getBoundingClientRect()` against the
  // real viewport width — clamped so neither edge of the panel can ever
  // exceed `[VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN]` — fixes
  // this for any trigger position and any viewport width, not just the one
  // pinned by the regression test. Recomputed on open, on resize (viewport
  // rotation/toolbar collapse), and on scroll (in case the trigger isn't
  // inside a sticky header in some future call site).
  useLayoutEffect(() => {
    if (!open) return;

    function computePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      // Mirrors the previous `w-[min(320px,92vw)]` Tailwind class.
      const panelWidth = Math.min(320, viewportWidth * 0.92);

      let left = rect.left;
      const maxLeft = viewportWidth - VIEWPORT_MARGIN - panelWidth;
      if (left > maxLeft) left = maxLeft;
      if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

      setPanelStyle({
        position: "fixed",
        top: rect.bottom + VIEWPORT_MARGIN,
        left,
        width: panelWidth,
      });
    }

    computePosition();
    window.addEventListener("resize", computePosition);
    window.addEventListener("scroll", computePosition, true);
    return () => {
      window.removeEventListener("resize", computePosition);
      window.removeEventListener("scroll", computePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!hasSiblings) return null;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Switch apps"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <LayoutGrid className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          style={panelStyle}
          className="z-50 overflow-hidden rounded-lg border border-border bg-background py-1.5 shadow-lg"
        >
          {ordered.map((tile) => {
            const config = APP_SWITCHER_CONFIG[tile.id];
            const rowClassName =
              "flex items-center gap-3 px-3 py-2 text-sm font-medium text-foreground";

            if (tile.current) {
              return (
                <span
                  key={tile.id}
                  aria-current="page"
                  className={cn(rowClassName, "cursor-default")}
                >
                  <AppMarkTile app={tile.id} />
                  <span className="flex-1">{config.name}</span>
                  <Check className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </span>
              );
            }

            return (
              <a
                key={tile.id}
                href={tile.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cn(rowClassName, "hover:bg-muted")}
              >
                <AppMarkTile app={tile.id} />
                <span className="flex-1">{config.name}</span>
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: config.accentColor }}
                />
              </a>
            );
          })}

          <p className="border-t border-border px-3 pt-2.5 pb-1 text-xs text-muted-foreground">
            Switching apps opens a separate site — you may need to sign in again.
          </p>
        </div>
      )}
    </div>
  );
}

function AppMarkTile({ app }: { app: AppMarkApp }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
      <AppMark app={app} size={20} />
    </span>
  );
}
