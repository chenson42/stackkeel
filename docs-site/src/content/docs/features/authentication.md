---
title: Next.js Authentication with 2FA, Google, and OIDC
description: "Stackkeel's authentication stack: NextAuth v5 with email/password, Google OAuth, native Google ID-token sign-in for mobile, a config-driven OIDC provider slot, TOTP two-factor auth with recovery codes, account lockout, and rate limiting."
---

Authentication is the part of every new app that is both mandatory and easy to get
subtly wrong. Stackkeel ships it finished, shared by the portal and admin apps
through one workspace package, `packages/auth`.

## Sign-in methods

- **Email and password** with bcrypt hashing, email verification, and a
  forgot-password flow using hashed one-shot tokens.
- **Google OAuth** for the web apps.
- **Native Google sign-in** for the mobile shell: a Credentials provider that
  verifies a Google ID token locally against Google's JWKS, accepting either the web
  or iOS client id as audience (`packages/auth/src/google-native-authorize.ts`,
  covered by its own contract test suite).
- **Generic OIDC slot**: set `AUTH_OIDC_ISSUER`, `AUTH_OIDC_ID`, and
  `AUTH_OIDC_SECRET` and an OIDC provider (Okta, Microsoft Entra, Auth0, and
  similar) appears in the provider list. Unset, it contributes nothing
  (`packages/auth/src/oidc.ts`).

Sessions use the JWT strategy. Because both apps share the identity schema, the
session cookie, and the token shape, signing into the portal signs you into the
admin app too, subject to your role.

## Two-factor authentication

TOTP with any authenticator app. Secrets are encrypted at rest with AES-256-GCM
under a dedicated key, enrollment uses a QR code with a pending-confirmation step,
and users get ten single-use `XXXX-XXXX` recovery codes shown exactly once
(`packages/auth/src/two-factor.ts`). The admin app enforces two-factor for
administrators: an unenrolled admin is routed to enrollment before anything else,
and the TOTP code is verified in the same atomic credentials call as the password.

## Abuse resistance

Five failed password attempts lock the account for fifteen minutes, with
enumeration-safe responses (`packages/auth/src/lockout.ts`). Sign-in attempts are
rate limited per IP and email, using Upstash Redis when configured and an in-memory
limiter otherwise. Open-redirect defense sanitizes every callback URL. Security
events (lockouts, 2FA changes, resets) land in the [audit log](/features/audit-and-flags/).

## The edge gate

Each app's `src/proxy.ts` protects routes with a declarative table of rules checked
against the JWT session projection. It runs on the Edge runtime and cannot import
the database; a `server-only` guard turns that mistake into a build failure. Route
gates stay readable, and authorization decisions are re-checked inside every server
action regardless.
