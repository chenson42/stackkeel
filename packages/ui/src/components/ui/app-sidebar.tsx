"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "./sidebar";
import type { SidebarNavGroup } from "./sidebar-nav";

// Convergence sidebar (2026-09-05-account-menu-restructure Increment E).
//
// Chris asked for the OPPOSITE of what DECISION-056 point 2 assumed: rather
// than migrating a predecessor app down onto the lighter `SidebarNav`, all three apps
// move UP onto one predecessor app's richer shadcn Sidebar — collapse-to-icon, hover
// tooltips when collapsed, the ⌘B shortcut, cookie-persisted open state, and
// a real mobile sheet. His words: "could the other two apps be upgraded to
// used the same nav as a predecessor app? just want consistency." That reversal is
// recorded as its own decision entry rather than left to contradict
// DECISION-056 silently.
//
// KEY DESIGN CHOICE: this deliberately accepts the SAME `groups` prop shape
// `SidebarNav` already used. Portal and the admin app build those arrays in
// Server Components with per-item feature filtering; keeping the contract
// identical means the convergence is a one-line swap at each of the four
// call sites instead of four hand-rewritten navs, and the filtering logic
// (the part with real authorization consequences if fumbled) is not touched
// at all.
//
// Auth-blind by the same binding condition SidebarNav had: this imports no
// auth, calls no redirect, and receives an already-filtered array.
export interface AppSidebarProps {
  groups: SidebarNavGroup[];
  /** Rendered inside SidebarContent, below the groups. */
  children?: React.ReactNode;
  /**
   * Show the filter box. Defaults on. Turn it off for a nav short enough that
   * a filter is noise — below ~8 items it costs more than it saves.
   */
  searchable?: boolean;
  /** Placeholder for the filter box. */
  searchPlaceholder?: string;
}

export function AppSidebar({
  groups,
  children,
  searchable = true,
  searchPlaceholder = "Search menu…",
}: AppSidebarProps) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const { state } = useSidebar();

  // Filter behaviour modelled on macOS System Settings search (Chris's own
  // reference): narrow the EXISTING menu in place rather than navigating to a
  // separate results view, match on substring so partial words work, and drop
  // a group entirely once none of its items match — a lingering empty group
  // header reads as "no results here" noise. Case-insensitive, trimmed, and
  // it also matches the group label so typing "settings" surfaces everything
  // under Settings.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => {
        const groupMatches = group.label?.toLowerCase().includes(q) ?? false;
        const items = groupMatches
          ? group.items
          : group.items.filter((i) => i.label.toLowerCase().includes(q));
        return { ...group, items };
      })
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  const isCollapsed = state === "collapsed";
  const showSearch = searchable && !isCollapsed;
  const noResults = query.trim().length > 0 && filtered.length === 0;

  return (
    <Sidebar collapsible="icon">
      {/* Hidden when collapsed to icons — a text input in a 3rem rail is
          unusable, and the rail is meant to be glanceable. */}
      {showSearch && (
        <SidebarHeader>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 opacity-50"
            />
            <SidebarInput
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Search menu"
              className="pl-8"
            />
          </div>
        </SidebarHeader>
      )}
      <SidebarContent>
        {noResults && (
          <p className="px-4 py-3 text-sm text-sidebar-foreground/60" role="status">
            No matches for “{query.trim()}”.
          </p>
        )}
        {filtered.map((group) => (
          <SidebarGroup key={group.id}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                      // Surfaces the label when the rail is collapsed to
                      // icons — otherwise collapsed mode is unusable for
                      // anyone who does not already know the icons.
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        {children}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
