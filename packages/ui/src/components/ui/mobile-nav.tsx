"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

// Mobile-forward navigation pair for portal-style surfaces (UX-PATTERNS § 2):
// TopNav renders the wordmark + inline items ≥ md; BottomTabs is the fixed
// bottom bar < md. Safe-area utilities (pt-safe / pb-safe) are mandatory on
// this fixed chrome so a native shell's notch and home indicator never
// overlap content — each app's globals.css defines those utilities.
//
// Items are caller-supplied pure data (a nav registry module), never built
// here — same registry rule as tiles (UX-PATTERNS § 3).

export interface MobileNavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function TopNav({
  items,
  brand,
  rightSlot,
}: {
  items: MobileNavItem[];
  /** Wordmark lockup, already wrapped in a Link to the app's home route. */
  brand: React.ReactNode;
  /** Right-aligned slot — typically the UserMenu (injected from the server layout). */
  rightSlot?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md pt-safe">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        {brand}
        <div className="flex items-center gap-2">
          <nav className="hidden items-center gap-1 md:flex">
            {items.map(({ path, label, icon: Icon }) => {
              const active = isActive(pathname, path);
              return (
                <Link
                  key={path}
                  href={path}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.2} />
                  {label}
                </Link>
              );
            })}
          </nav>
          {rightSlot}
        </div>
      </div>
    </header>
  );
}

export function BottomTabs({ items }: { items: MobileNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur-md md:hidden pb-safe">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1.5">
        {items.map(({ path, label, icon: Icon }) => {
          const active = isActive(pathname, path);
          return (
            <Link
              key={path}
              href={path}
              className={`flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-secondary" : "bg-transparent"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2.3} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
