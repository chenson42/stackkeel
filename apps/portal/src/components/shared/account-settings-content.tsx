"use client";

import { useEffect, useState } from "react";
import {
  AccountSection,
  ChangePasswordSection,
  TwoFactorStatusSection,
} from "@repo/ui";
import { getAccountOverview, type AccountOverview } from "@/app/(account)/account/overview";
import { changePassword } from "@/app/(account)/account/actions";
import { ProfileForm } from "@/app/(account)/account/profile-form";
import { EmailForm } from "@/app/(account)/account/email-form";
import { DeleteAccountButton } from "@/app/(account)/account/delete-button";
import { FeedbackOptOutToggle } from "@/app/(account)/account/feedback-opt-out-toggle";
import { FeedbackForm, MyFeedbackList } from "@repo/ui";
import { getMyFeedback, submitFeedback } from "@/app/(member)/feedback/actions";
import { APP_VERSION } from "@/lib/version";

// Every section the retired /account page carried, now inside the shared
// dialog (2026-09-05-account-menu-restructure Increment C). The existing
// section components are reused as-is rather than rewritten — they already
// own their own server actions and validation; only their container changed.
//
// Data loads when the dialog opens (see overview.ts for why not eagerly).
// Until it arrives the dialog shows a short loading line rather than an empty
// shell, so the user never sees sections pop in one at a time.
export function AccountSettingsContent() {
  const [data, setData] = useState<AccountOverview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAccountOverview()
      .then((d) => {
        if (cancelled) return;
        if (d) setData(d);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p role="alert" className="py-6 text-sm text-muted-foreground">
        Could not load your account details. Close this and try again.
      </p>
    );
  }

  if (!data) {
    return (
      <p role="status" className="py-6 text-sm text-muted-foreground">
        Loading your account…
      </p>
    );
  }

  return (
    <>
      <AccountSection title="Profile" description="Update your display name.">
        <ProfileForm name={data.name} />
      </AccountSection>

      <AccountSection
        title="Email address"
        description="A verification link will be sent to your new address. Your sign-in email changes only after you click the link."
      >
        <EmailForm currentEmail={data.email} pendingEmail={data.pendingEmail} />
      </AccountSection>

      {/* Credentials users only — a Google-only account has no password. */}
      {data.hasPassword && (
        <AccountSection
          title="Password"
          description="Change your sign-in password. Minimum 8 characters."
        >
          <ChangePasswordSection
            onSubmit={async (input) => {
              const result = await changePassword(input);
              return result.ok ? undefined : { error: result.error };
            }}
          />
        </AccountSection>
      )}

      <AccountSection
        title="Two-factor authentication"
        description="Add an extra layer of security using an authenticator app."
      >
        {/* Enrollment stays a full route: it is a multi-step flow with a QR
            code and recovery codes, which does not belong nested in a dialog.
            The dialog reports status and hands off. `/account/2fa` is one
            route that branches internally on enrollment state (not two
            routes), so setupHref and manageHref are the same URL. */}
        <TwoFactorStatusSection
          enrolled={data.isEnrolledInTotp}
          setupHref="/account/2fa"
          manageHref="/account/2fa"
        />
      </AccountSection>

      {/* Titled "Send feedback", not "Feedback", because that is the exact
          path the home card's "Stop asking" dialog promises: "You can
          re-enable the daily prompt any time from Account settings → Send
          feedback." Until 2026-09-05 that destination did not exist — the
          permanent form was dropped when /account became a dialog and only
          the opt-out toggle moved across, so the app was pointing users at a
          screen that had no such thing. */}
      <AccountSection
        title="Send feedback"
        description="Send us feedback any time, and control the periodic prompt on your home page."
      >
        <div className="space-y-4">
          <FeedbackForm onSubmit={submitFeedback} appVersion={APP_VERSION} />
          <FeedbackOptOutToggle optedOut={data.feedbackOptedOut} />
        </div>
      </AccountSection>

      {data.feedbackStatusViewEnabled && (
        <AccountSection
          title="My feedback"
          description="Everything you've sent us, across all three apps, and where it stands."
        >
          <MyFeedbackList fetchItems={getMyFeedback} />
        </AccountSection>
      )}

      <AccountSection
        title="Danger zone"
        description="Permanently delete your account and all associated data. This cannot be undone."
      >
        <DeleteAccountButton />
      </AccountSection>
    </>
  );
}
