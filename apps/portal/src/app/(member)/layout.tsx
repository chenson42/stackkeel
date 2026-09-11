import { redirect } from "next/navigation";
import { cachedAuth } from "@/lib/auth/cached-auth";
import { GlobalNav } from "@/components/shared/global-nav";
import { isFlagEnabled } from "@/lib/flags";
// kit-module:device-auth-begin
import { AppVersionProvider } from "@/components/mobile/AppVersionProvider";
import { AppVersionGate } from "@/components/mobile/AppVersionGate";
import { MobileDeviceRegistrar } from "@/components/mobile/MobileDeviceRegistrar";
import { MobileDeepLinkHandler } from "@/components/mobile/MobileDeepLinkHandler";
import { ScrollGuard } from "@/components/mobile/ScrollGuard";
// kit-module:device-auth-end

// NOTE: The 2FA gate is intentionally absent here. /home is not an admin
// surface. Forks wanting site-wide 2FA add the check here or in proxy.ts.
//
// 2026-09-04-portal-sidebar-nav: GlobalNav is now the full member shell
// (header + SidebarNav + <main>) — this layout's own body is unchanged
// except the return statement, which now just passes children through.
export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await cachedAuth();
  if (!session?.user) redirect("/signin?callbackUrl=/home");

  // kit-module:device-auth-begin
  // Native bridge (module `mobile`): every component below renders null and
  // no-ops outside the Capacitor WebView. The flag read is server-side so
  // the version gate's enablement never flashes client-side.
  const updateCheckEnabled = await isFlagEnabled("mobile.update_check").catch(() => false);
  // kit-module:device-auth-end

  return (
    <AppVersionProvider updateCheckEnabled={updateCheckEnabled}>
      <MobileDeviceRegistrar />
      <MobileDeepLinkHandler />
      <ScrollGuard />
      <AppVersionGate />
      <GlobalNav session={session}>{children}</GlobalNav>
    </AppVersionProvider>
  );
}
