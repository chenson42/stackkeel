import { Users, Inbox, ShieldCheck, Mail, Flag, MessageSquare, KeyRound, LifeBuoy, Palette, Smartphone, PackageCheck } from "lucide-react";
import { AppSidebar, type SidebarNavGroup } from "@repo/ui";

// Thin adapter over the shared @repo/ui AppSidebar primitive
// (converged onto a predecessor app's richer shadcn Sidebar 2026-09-05, Increment E —
// collapse-to-icon, tooltips, cookie-persisted state; the `groups` contract
// is unchanged, which is why this swap is two lines.)
// Previously over SidebarNav
// (2026-09-04-portal-sidebar-nav, DECISION-056/057). This file used to be a
// full hand-rolled implementation (fixed <aside>, hardcoded hex colors,
// hamburger + off-canvas drawer, per-item startsWith active-state check) —
// that shape was the exact reference SidebarNav generalizes from. Retrofit
// per DECISION-056 point 4: a promotion only one call site consumes just
// relocates the maintenance burden instead of reducing it.
//
// Prop signature: plain booleans —
// ./layout.tsx already computes these via hasFeature() before rendering
// this component, and needs no changes.
export function AppSidebarNav({
  canUsers,
  canRoles,
  canAudit,
  canEmailQueue,
  canFlags,
  canFeedback,
  canTickets,
  canBranding,
  canDevices,
}: {
  canUsers: boolean;
  canRoles: boolean;
  canAudit: boolean;
  canEmailQueue: boolean;
  canFlags: boolean;
  canFeedback: boolean;
  canTickets: boolean;
  canBranding: boolean;
  canDevices: boolean;
}) {
  const groups: SidebarNavGroup[] = [
    {
      id: "administration",
      // "Directory" rather than "Administration" (Chris, 2026-09-05): in
      // Admin these ARE the app's purpose, not a settings corner of
      // it, and "Administration" inside an app already called Admin is
      // redundant. Note Users belongs here — the 2026-09-05 rule removing it
      // from menus applies to the OTHER apps' settings menus, since this app
      // is where user administration now lives.
      label: "Directory",
      items: [
        ...(canUsers ? [{ href: "/users", label: "Users", icon: <Users /> }] : []),
        // Roles & permissions UX (2026-09-09-roles-permissions-ux Phase 3
        // § 8: "New canRoles item under 'Directory', after Account
        // requests"). Edits WHAT a role grants (role_features) — a
        // materially different, separately-revocable privilege from
        // Users/Account requests (which edit WHO holds a role), hence its
        // own FEATURES.ADMIN_ROLES gate rather than reusing ADMIN_USERS.
        ...(canRoles ? [{ href: "/roles", label: "Roles", icon: <KeyRound /> }] : []),
      ],
    },
  ];

  // "Monitoring" is this app's first genuine second group. Until the audit
  // viewer existed there were two items total, which is why the submenu work
  // was sequenced last — structure follows surfaces, not the other way round.
  // Email queue lives here, not in Platform: it's queue *monitoring*, not
  // platform *configuration* (2026-09-05-admin-menu-structure design, item 6).
  // Feedback joins the same group (Increment 6, step 6a): cross-app content
  // oversight, the same family as Audit log/Email queue, not identity
  // administration (Directory) or configuration (Platform).
  // Tickets sits with Feedback (module `helpdesk`): both are cross-app
  // content oversight; promotion flows from one queue into the other.
  if (canAudit || canEmailQueue || canFeedback || canTickets) {
    groups.push({
      id: "monitoring",
      label: "Monitoring",
      items: [
        ...(canAudit ? [{ href: "/audit", label: "Audit log", icon: <ShieldCheck /> }] : []),
        ...(canEmailQueue ? [{ href: "/email-queue", label: "Email queue", icon: <Mail /> }] : []),
        ...(canFeedback ? [{ href: "/feedback", label: "Feedback", icon: <MessageSquare /> }] : []),
        ...(canTickets ? [{ href: "/tickets", label: "Tickets", icon: <LifeBuoy /> }] : []),
      ],
    });
  }

  // "Platform" is this app's first cross-app-configuration group, as
  // distinct from Monitoring (read-only observability) and Directory
  // (identity administration) — 2026-09-05-admin-menu-structure.
  if (canFlags || canBranding || canDevices) {
    groups.push({
      id: "platform",
      label: "Platform",
      items: [
        ...(canFlags ? [{ href: "/flags", label: "Feature flags", icon: <Flag /> }] : []),
        ...(canBranding ? [{ href: "/branding", label: "Branding", icon: <Palette /> }] : []),
        // Device fleet + its update policy are one ADMIN_DEVICES privilege
        // (module `mobile`): configuration of the native surface, so
        // Platform, not Monitoring.
        ...(canDevices ? [{ href: "/devices", label: "Devices", icon: <Smartphone /> }] : []),
        ...(canDevices
          ? [{ href: "/app-release", label: "App release", icon: <PackageCheck /> }]
          : []),
      ],
    });
  }

  return <AppSidebar groups={groups} />;
}
