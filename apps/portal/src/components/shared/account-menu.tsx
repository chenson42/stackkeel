"use client";

import { useState } from "react";
import { AccountSettingsDialog, UserMenu } from "@repo/ui";
import { AccountSettingsContent } from "@/components/shared/account-settings-content";

// Client wrapper owning the account-settings dialog's open state
// (2026-09-05-account-menu-restructure). Rendered as a SIBLING of UserMenu,
// not inside its dropdown — Radix unmounts dropdown content on close, which
// would tear the dialog down as soon as the item is selected.
//
// Increment C: every section the /account route used to carry now lives in
// AccountSettingsContent, and the route itself is retired to a redirect.
export function AccountMenu({
  name,
  email,
  image,
  onSignOut,
}: {
  name: string | null | undefined;
  email: string | null | undefined;
  image?: string | null | undefined;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <UserMenu
        name={name}
        email={email}
        image={image}
        onOpenAccountSettings={() => setOpen(true)}
        onSignOut={onSignOut}
      />
      <AccountSettingsDialog
        open={open}
        onOpenChange={setOpen}
        name={name}
        email={email}
      >
        {/* Mounted only while open, so the overview query in
            AccountSettingsContent fires on open rather than on every page. */}
        {open && <AccountSettingsContent />}
      </AccountSettingsDialog>
    </>
  );
}
