import Link from "next/link";
import { redirect } from "next/navigation";
import { AppSwitcher, hasAppSwitcherSiblings } from "@repo/ui";
import { AccountMenu } from "@/components/shared/account-menu";
import { signOut } from "@/auth";
import { cachedAuth } from "@/lib/auth/cached-auth";
import { FEATURES } from "@/lib/permissions";
import { getAppSwitcherTiles } from "@/lib/app-switcher";

// NOTE: The 2FA gate is intentionally absent here. Users must be able to
// reach /account/2fa to complete self-serve enrollment even when
// twoFactorRequired is true and they have not yet verified this session.
//
// 2026-09-05: no sidebar here, deliberately. Chris: "Account setting should
// be a dialog that gets launched from the profile avatar menu. Shouldn't be
// in the app menu." /account itself is now a redirect and the only leaf left
// under this group is /account/2fa — a multi-step QR + recovery-code flow the
// account dialog links out to. A one-item nav rail for it would be exactly
// the app-menu placement that direction rules out, so this shell is header +
// content only.
//
// Earlier 2026-09-05 note: this layout was the fifth distinct "who am
// I / sign out" treatment in the monorepo and the one users land on directly
// from the newly-unified header UserMenu's own "Account settings" link — a
// bare grid with no header, no logo lockup, no AppSwitcher, a "← Home" text
// link, and a bespoke `Sign out (email@address)` link-button. Rebuilt on the
// same header + SidebarNav + <main> shell as the member and admin shells so
// the chrome doesn't change out from under the user mid-navigation.
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await cachedAuth();
  if (!session?.user) redirect("/signin?callbackUrl=/account");

  const isAdmin = session.user.features?.includes(FEATURES.ADMIN_DASHBOARD) ?? false;

  const switcherTiles = getAppSwitcherTiles(session.user.roles);
  const showSwitcherDivider = hasAppSwitcherSiblings(switcherTiles);

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between gap-4 py-3 pr-4 pl-16 sm:pr-6 md:pl-6">
          <div className="flex shrink-0 items-center gap-2">
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
              <img src="/brand/wordmark.svg" alt="PORTAL" width={140} height={62} />
            </Link>
          </div>
          <AccountMenu
            name={session.user.name}
            email={session.user.email}
            image={session.user.image}
            onSignOut={signOutAction}
          />
        </div>
      </header>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
