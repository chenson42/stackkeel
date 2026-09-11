import Link from "next/link";
import {
  AppSidebar,
  AppSwitcher,
  SidebarProvider,
  SidebarTrigger,
  hasAppSwitcherSiblings,
  type SidebarNavGroup,
} from "@repo/ui";
import { AccountMenu } from "@/components/shared/account-menu";
import { signOut } from "@/auth";
import { FEATURES } from "@/lib/permissions";
import { isFlagEnabled } from "@/lib/flags";
import { buildPortalNavGroups } from "@/lib/nav-groups";
import { getAppSwitcherTiles } from "@/lib/app-switcher";
import type { Session } from "next-auth";

const BELL_RECENT_LIMIT = 8;

// Server Component — no 'use client', no useSession(). Async because the
// Projects link needs the tasks.module flag read (isFlagEnabled) alongside
// the session already passed in from the parent layout, which called auth().
// The interactive avatar dropdown is an isolated 'use client' leaf
// (<UserMenu>); this nav shell stays Server.
//
// 2026-09-04-portal-sidebar-nav (DECISION-056/057): GlobalNav widened from a
// header-only component to the full member shell — header (brand + AppBadge
// + bell + avatar) + a left SidebarNav (My Tasks / Projects) + <main>. The
// data-fetching section below (bell counts, flag reads, isAdmin) is
// unchanged from before this conversion — only the returned JSX changed.
// SidebarNav itself is auth-blind: it only ever receives this
// already-computed, already-filtered `groups` array as a prop.

export async function GlobalNav({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const isAdmin = session.user.features?.includes(FEATURES.ADMIN_DASHBOARD) ?? false;

  const groups: SidebarNavGroup[] = buildPortalNavGroups({ session });


  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  const switcherTiles = getAppSwitcherTiles(session.user.roles);
  // Divider only makes sense when the switcher trigger actually renders
  // (see hasAppSwitcherSiblings) — otherwise it's a rule with nothing to
  // its left (2026-09-04 loop-back).
  const showSwitcherDivider = hasAppSwitcherSiblings(switcherTiles);

  return (
    <SidebarProvider>
      {/* Structure is load-bearing: Sidebar renders `fixed inset-y-0 h-svh`,
          so it must be a DIRECT child of SidebarProvider's flex row with the
          content as its sibling. Nesting it under a flex-col with the header
          above made it overlay the header (2026-09-05 regression — the nav
          items rendered on top of the logo). The header therefore lives
          inside <main>, matching a predecessor app's long-working shape. */}
      <AppSidebar groups={groups} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex shrink-0 items-center gap-2">
            <SidebarTrigger />
            <AppSwitcher tiles={switcherTiles} />
            <Link
              href="/home"
              className={
                showSwitcherDivider
                  ? "flex items-center gap-2 border-l border-border pl-2"
                  : "flex items-center gap-2"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/wordmark.svg"
                alt="PORTAL"
                width={140}
                height={62}
              />
            </Link>
          </div>
          <nav className="flex items-center gap-4">
            <AccountMenu
              name={session.user.name}
              email={session.user.email}
              image={session.user.image}
              onSignOut={signOutAction}
            />
          </nav>
        </div>
      </header>
        <div className="min-w-0 flex-1 overflow-auto p-6">{children}</div>
      </main>
    </SidebarProvider>
  );
}
