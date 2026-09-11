import { redirect } from "next/navigation";
import { cachedAuth } from "@/lib/auth/cached-auth";
import { GlobalNav } from "@/components/shared/global-nav";

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
  return <GlobalNav session={session}>{children}</GlobalNav>;
}
