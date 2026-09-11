"use client";

import Image from "next/image";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

// Promoted from apps/portal/src/components/shared/user-menu.tsx (2026-09-05,
// cross-app UI-consistency audit). Portal's own version was the only one of
// the three apps with a real avatar + dropdown pattern — a predecessor app had an
// icon-only sidebar-footer button with no dropdown, the admin app (and
// Portal's own separate /admin shell) had a bare "Sign out" text button,
// neither with an avatar or any account entry point. This generalizes
// Portal's shape (byte-identical trigger/avatar/dropdown markup) so all
// three headers render the same "who am I / sign out" affordance.
//
// SCOPE RULE (Chris, 2026-09-05): "Profile should only have account. Not app
// settings." This menu carries identity, Account settings, and Sign out —
// nothing else. The earlier generic `links` array was removed rather than
// left unused: it existed only to carry Portal's admin entry, which now
// lives in the app's own sidebar where app-level settings belong. Keeping a
// consumerless slot here would invite exactly the drift this rule forbids.
export interface UserMenuProps {
  name: string | null | undefined;
  email: string | null | undefined;
  image?: string | null | undefined;
  /** Optional third line under name/email — e.g. one predecessor app's role display name. */
  roleLabel?: string | null;
  /**
   * Renders the "Account settings" item, which fires this instead of
   * navigating. Account settings is a dialog, not a route
   * (2026-09-05-account-menu-restructure) — the host owns the open state so
   * the dialog can live outside this dropdown's own unmounting.
   */
  onOpenAccountSettings?: () => void;
  onSignOut: () => Promise<void>;
}

function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = name?.trim() || email?.trim() || "?";
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return source[0]!.toUpperCase();
}

export function UserMenu({
  name,
  email,
  image,
  roleLabel,
  onOpenAccountSettings,
  onSignOut,
}: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Account menu"
          className="overflow-hidden rounded-full border-border bg-muted p-0 text-xs font-medium text-foreground shadow-none hover:bg-muted hover:opacity-90"
        >
          {image ? (
            <Image src={image} alt="" width={32} height={32} className="h-full w-full object-cover" />
          ) : (
            initials(name, email)
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          <span className="block truncate font-medium text-foreground">
            {name || "Your account"}
          </span>
          {email && <span className="block truncate">{email}</span>}
          {roleLabel && <span className="block truncate">{roleLabel}</span>}
        </DropdownMenuLabel>
        {onOpenAccountSettings && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onOpenAccountSettings}
              className="focus:bg-muted focus:text-foreground"
            >
              Account settings
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onSignOut()}
          className="focus:bg-muted focus:text-foreground"
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
