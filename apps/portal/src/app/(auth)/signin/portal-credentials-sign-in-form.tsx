"use client";

// Thin client-side composition wrapper around @repo/ui's CredentialsSignInForm
// + Portal's own <Turnstile> widget.
//
// Why this exists: `CredentialsSignInFormProps.captcha.render` is a plain
// closure `(slot) => ReactNode` — NOT a "use server" action — and Next.js's
// RSC boundary forbids passing a plain function from a Server Component to
// a Client Component (only serializable data, JSX/ReactNode, and functions
// explicitly marked "use server" may cross that boundary). `signin/page.tsx`
// must stay a Server Component (it awaits `auth()`/`isLocalLoginEnabled()`
// and defines the inline "use server" Google sign-in action), so it cannot
// construct `captcha.render` itself. This wrapper receives everything else
// as plain props/server-action references (both of which DO cross the
// boundary fine) and builds the `captcha` prop internally, entirely on the
// client side, where passing a plain closure to a sibling client component
// is unrestricted.
//
// Found live during apps/portal/docs/work-log/2026-09-04-shared-login-component.md's
// Increment B — a real integration gap Increment A's design didn't
// anticipate, fixed here at the Portal integration layer without changing
// @repo/ui's CredentialsSignInForm contract at all.

import { CredentialsSignInForm, type CredentialsSignInFormProps } from "@repo/ui";
import { Turnstile } from "@/components/shared/turnstile";

type Props = Omit<CredentialsSignInFormProps, "captcha"> & {
  siteKeySet: boolean;
};

export function PortalCredentialsSignInForm({ siteKeySet, ...rest }: Props) {
  return (
    <CredentialsSignInForm
      {...rest}
      captcha={{
        siteKeySet,
        render: ({ onVerify, onExpire, onError }) => (
          <Turnstile onVerify={onVerify} onExpire={onExpire} onError={onError} />
        ),
      }}
    />
  );
}
