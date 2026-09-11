"use client";

import { useState } from "react";
import {
  AccountSection,
  AccountSettingsDialog,
  ChangePasswordSection,
  FeedbackForm,
  MyFeedbackList,
  TwoFactorStatusSection,
  UserMenu,
} from "@repo/ui";
import { changePassword, getMyFeedback, submitFeedback } from "./account/actions";

// Client wrapper owning the account-settings dialog's open state
// (2026-09-05-account-menu-restructure, Increment B). Rendered as a SIBLING
// of UserMenu, not inside its dropdown — Radix unmounts dropdown content on
// close, which would tear the dialog down the instant the item is selected.
//
// Admin previously had no self-serve account surface at all; the
// password section is backed by the server action added in this same
// increment.
export function AccountMenu({
  name,
  email,
  image,
  onSignOut,
  showMyFeedback,
  hasTotp,
}: {
  name: string | null | undefined;
  email: string | null | undefined;
  image?: string | null | undefined;
  onSignOut: () => Promise<void>;
  /** feedback.status_view (root DECISION-015) — gates the "My feedback"
   *  section. Absent-when-off, never present-but-erroring: the action
   *  re-checks the same flag independently (see account/actions.ts). */
  showMyFeedback?: boolean;
  /** session.user.hasTotp — already-resident JWT claim, no new fetch.
   *  2026-09-07 account-settings audit: ADMIN had no 2FA entry point in
   *  this dialog at all before this. `manageHref` is intentionally omitted
   *  — /setup-mfa has no enrolled-state guard and would silently
   *  re-enroll + invalidate current recovery codes (see
   *  docs/work-log/2026-09-07-account-settings-2fa-status.md). */
  hasTotp: boolean;
}) {
  const [open, setOpen] = useState(false);

  async function handleChangePassword(input: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    const result = await changePassword(input);
    if (!result.ok) return { error: result.error };
    return undefined;
  }

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
        <AccountSection title="Password">
          <ChangePasswordSection onSubmit={handleChangePassword} />
        </AccountSection>
        <AccountSection
          title="Two-factor authentication"
          description="Add an extra layer of security using an authenticator app."
        >
          <TwoFactorStatusSection enrolled={hasTotp} setupHref="/setup-mfa" />
        </AccountSection>
        <AccountSection
          title="Send feedback"
          description="Tell us what's working, what's not, or what you'd like to see."
        >
          <FeedbackForm onSubmit={submitFeedback} />
        </AccountSection>
        {showMyFeedback && (
          <AccountSection
            title="My feedback"
            description="Everything you've sent us, across all three apps, and where it stands."
          >
            <MyFeedbackList fetchItems={getMyFeedback} />
          </AccountSection>
        )}
      </AccountSettingsDialog>
    </>
  );
}
