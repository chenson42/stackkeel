import { Home, Megaphone, MessageSquare } from "lucide-react";
import type { SidebarNavGroup } from "@repo/ui";
import type { Session } from "next-auth";

// Single source of truth for Portal's sidebar nav. Registry rule
// (UX-PATTERNS § 3): pure data built from the session only — per-item
// visibility here is a dead-link hint, never the authorization boundary,
// which stays in each destination page and in proxy.ts.
//
// The kit portal ships a deliberately small nav: Home, What's new, and
// Feedback. A fork's product nav grows here (and only here) — one edit
// point, consumed by GlobalNav's shell.
export function buildPortalNavGroups(_opts: { session: Session }): SidebarNavGroup[] {
  return [
    {
      id: "main",
      items: [
        { href: "/home", label: "Home", icon: <Home /> },
        { href: "/whats-new", label: "What\u2019s new", icon: <Megaphone /> },
        { href: "/feedback", label: "Feedback", icon: <MessageSquare /> },
      ],
    },
  ];
}
