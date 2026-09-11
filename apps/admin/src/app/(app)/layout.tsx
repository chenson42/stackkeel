import Link from "next/link";
import { redirect } from "next/navigation";
import { AppSwitcher, SidebarProvider, SidebarTrigger, hasAppSwitcherSiblings } from "@repo/ui";
import { AccountMenu } from "./account-menu";
import { auth, signOut } from "@/auth";
import { FEATURES, hasFeature } from "@repo/permissions";
import { AppSidebarNav } from "./app-sidebar-nav";
import { getAppSwitcherTiles } from "@/lib/app-switcher";
import { isFlagEnabled } from "@/lib/flags";

// Left sidebar for this app's own content nav (Users, Requests), matching
// a predecessor app's AppSidebar pattern — per Chris's explicit direction, 2026-09-04:
// the "top bar carries the switcher, each app keeps its own left sidebar"
// decision applies here too, overriding Phase 3's original "too small to
// bother" reasoning. The top strip below is this app's own identity bar for
// now (no shared switcher yet — that's a later, separate increment); once
// the switcher ships it replaces this header, not the sidebar.
// src/proxy.ts has already gated every route by the time this renders
// (unauthenticated -> /signin, zero-role -> /access-pending, no-TOTP ->
// /setup-mfa) — the per-link hasFeature() checks in AppSidebarNav are the
// same kind of "dead-link hint" the other two apps' role-based UI
// affordances use, not the authorization boundary itself.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const canUsers = hasFeature(session.user.features, FEATURES.ADMIN_USERS);
  const canRoles = hasFeature(session.user.features, FEATURES.ADMIN_ROLES);
  const canAudit = hasFeature(session.user.features, FEATURES.ADMIN_AUDIT);
  const canEmailQueue = hasFeature(session.user.features, FEATURES.ADMIN_EMAIL_QUEUE);
  const canFlags = hasFeature(session.user.features, FEATURES.ADMIN_FLAGS);
  const canFeedback = hasFeature(session.user.features, FEATURES.ADMIN_FEEDBACK);

  const showMyFeedback = await isFlagEnabled("feedback.status_view");

  const switcherTiles = getAppSwitcherTiles(session.user.roles);
  // Divider only makes sense when the switcher trigger actually renders
  // (see hasAppSwitcherSiblings) — otherwise it's a rule with nothing to
  // its left (2026-09-04 loop-back).
  const showSwitcherDivider = hasAppSwitcherSiblings(switcherTiles);

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <SidebarProvider>
      {/* Sidebar is `fixed inset-y-0 h-svh` and must be a DIRECT child of
          SidebarProvider's flex row; the header lives inside <main> so the
          sidebar sits beside it rather than overlaying it. See the matching
          comment in Portal's global-nav.tsx. */}
      <AppSidebarNav
        canUsers={canUsers}
        canRoles={canRoles}
        canAudit={canAudit}
        canEmailQueue={canEmailQueue}
        canFlags={canFlags}
        canFeedback={canFeedback}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <AppSwitcher tiles={switcherTiles} />
            <Link
              href="/users"
              className={
                showSwitcherDivider
                  ? "flex items-center gap-2 border-l border-border pl-2"
                  : "flex items-center gap-2"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/wordmark.svg" alt="ADMIN" width={140} height={62} />
            </Link>
          </div>
          <AccountMenu
            name={session.user.name}
            email={session.user.email}
            image={session.user.image}
            onSignOut={signOutAction}
            showMyFeedback={showMyFeedback}
            hasTotp={session.user.hasTotp}
          />
        </div>
      </header>
        <div className="min-w-0 flex-1 overflow-auto p-6">{children}</div>
      </main>
    </SidebarProvider>
  );
}
