"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "../../lib/utils";

// Generic sidebar-nav primitive (2026-09-04-portal-sidebar-nav,
// DECISION-056/057). Third occurrence of the same lightweight pattern
// (fixed-width <aside>, optional accent-bar group label, pathname-based
// active state, hamburger + off-canvas drawer for mobile) — first seen
// hand-rolled in apps/admin/src/app/(app)/app-sidebar-nav.tsx (the platform
// Admin). This promotion generalizes that shape, NOT one predecessor app's heavier
// shadcn Sidebar system (a predecessor app/src/components/ui/sidebar.tsx —
// SidebarProvider/cookie-persisted collapse/keyboard shortcut), which is a
// separate, out-of-scope concern (DECISION-056 point 2). Named `SidebarNav`,
// not `Sidebar`, precisely to avoid colliding with that other, materially
// different app-local export.
//
// Auth-blind by binding condition (DECISION-056 point 3): this component
// never imports `auth()`/`cachedAuth()`/`hasFeature()`/
// `needsTwoFactorVerification()` and never calls `redirect()`. It receives
// an already-computed, already-filtered `groups` prop and manages only its
// own mobile open/closed UI state. Every server layout that renders this
// keeps its own session/2FA gate exactly where it is today, before
// rendering anything — see admin/layout.tsx (a predecessor app & Portal) and
// (member)/layout.tsx (Portal) for the callers this component must never
// have any awareness of.
//
// Every literal hex/bg-white color from the original the admin app source
// has been converted to a semantic Tailwind token (DECISION-057 point 2):
// #eef3f8 -> bg-muted, #d8e2eb -> border-border, #3f4a55 ->
// text-muted-foreground, bg-white -> bg-background. var(--primary)/
// var(--accent) usages (group-label text, accent bar, active-item text)
// were already token-driven and are unchanged.

export interface SidebarNavItem {
  href: string;
  label: string;
  /**
   * A pre-rendered icon element (e.g. `<Users />` from lucide-react), NOT a
   * component reference. This is deliberate, not a style choice: `groups`
   * is almost always built by a Server Component (GlobalNav, admin
   * layouts) and passed down into this `'use client'` primitive — React
   * cannot serialize a bare function/component reference across that
   * boundary ("Functions cannot be passed directly to Client Components"),
   * but a Server-rendered element CAN cross it, because it's already been
   * resolved to opaque content by the time it reaches here. SidebarNav
   * applies its own fixed sizing/opacity wrapper, so callers just pass a
   * bare `<Icon />` with no size props. Optional — a caller with no icon
   * set renders label-only.
   */
  icon?: ReactNode;
}

export interface SidebarNavGroup {
  /** Stable React key; never rendered. */
  id: string;
  /** Omit for an ungrouped list — no accent-bar label is rendered. */
  label?: string;
  items: SidebarNavItem[];
}

export interface SidebarNavProps {
  groups: SidebarNavGroup[];
  /** Tailwind width class for the desktop rail. Default "w-[232px]" —
   * the admin app's current fixed width. */
  widthClassName?: string;
  className?: string;
}

interface FlatItem extends SidebarNavItem {
  groupId: string;
}

function flattenGroups(groups: SidebarNavGroup[]): FlatItem[] {
  const flat: FlatItem[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      flat.push({ ...item, groupId: group.id });
    }
  }
  return flat;
}

/**
 * Longest-prefix match across the FULL flattened item list — not a per-item
 * independent `startsWith` check. the admin app's original algorithm
 * (`pathname === href || pathname.startsWith(href + "/")`, evaluated
 * per-item in isolation) breaks the moment one href is a literal prefix of
 * another in the same nav (e.g. Portal admin's `/admin` "Dashboard" is a
 * prefix of `/admin/users`, `/admin/audit`, etc.) — it would mark BOTH
 * "Dashboard" and "Users" active on `/admin/users`. This resolves it: an
 * exact match wins outright; otherwise, among items whose href is a real
 * path-segment prefix of the current pathname, the longest href wins.
 */
function findActiveHref(pathname: string, items: FlatItem[]): string | null {
  const exact = items.find((item) => item.href === pathname);
  if (exact) return exact.href;

  let best: FlatItem | null = null;
  for (const item of items) {
    if (pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) {
        best = item;
      }
    }
  }
  return best?.href ?? null;
}

export function SidebarNav({ groups, widthClassName = "w-[232px]", className }: SidebarNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const flatItems = flattenGroups(groups);
  if (flatItems.length === 0) return null;

  const activeHref = findActiveHref(pathname, flatItems);

  const list = (
    <>
      {groups.map((group) => {
        if (group.items.length === 0) return null;
        return (
          <div key={group.id} className="mb-1.5">
            {group.label && (
              <div className="relative m-0 mt-0.5 mb-1.5 pl-[19px] text-[10.5px] font-bold tracking-[0.08em] text-[color:var(--primary)] uppercase before:absolute before:top-px before:bottom-px before:left-4 before:w-[3px] before:rounded before:bg-[color:var(--accent)] before:content-['']">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const isActive = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "mx-2 my-0.5 flex items-center gap-2.5 rounded-lg px-4 py-1.5 text-[13.5px]",
                    isActive
                      ? "bg-background font-semibold text-[color:var(--primary)] shadow-sm"
                      : "text-muted-foreground hover:bg-background/60",
                  )}
                >
                  {item.icon && (
                    <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center opacity-75 [&>svg]:h-full [&>svg]:w-full">
                      {item.icon}
                    </span>
                  )}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );

  return (
    <>
      {/* Mobile: hamburger toggle, header-height aligned, hidden at md+ */}
      <button
        type="button"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="fixed top-3 left-4 z-40 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background shadow-sm md:hidden"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Desktop: always-visible static sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 overflow-auto border-r border-border bg-muted py-3 md:block",
          widthClassName,
          className,
        )}
      >
        {list}
      </aside>

      {/* Mobile: off-canvas drawer + backdrop, only mounted while open */}
      {open && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute top-0 left-0 h-full w-[80vw] max-w-[280px] overflow-auto border-r border-border bg-muted py-3 pt-14 shadow-lg">
            {list}
          </aside>
        </div>
      )}
    </>
  );
}
