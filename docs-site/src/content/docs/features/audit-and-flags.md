---
title: Audit Log and Feature Flags
description: "Stackkeel ships an append-only audit log with CI-enforced coverage of security-sensitive mutations, plus database-backed feature flags with an admin toggle UI and a seeded-off-by-default convention."
---

## The audit log

Every security-sensitive mutation writes an `audit_events` row: role changes, user
deactivation, 2FA enrollment and resets, sign-in failures and lockouts, ticket state
changes, device registration, branding edits. Rows capture the actor, the action (a
frozen string from the `AUDIT_ACTIONS` catalog), the target, the IP, and metadata.
The log is append-only; nothing in the apps updates or deletes it.

What makes this more than a convention is the tripwire. `check-audit-coverage`
runs in CI and fails the build when a server action mutates state without a
`recordAudit()` call. Genuinely read-only or low-stakes actions opt out with an
explicit `// audit-exempt: <reason>` comment, which makes every exemption visible in
review. The admin app ships a filterable audit viewer at `/audit`.

Each app keeps a mirror test of its audit-action catalog, so a renamed or deleted
action string fails a unit test before it ever produces an unreadable log row.

## Feature flags

Flags answer "is this switched on here?", never "is this user allowed?". That
distinction is [Invariant 4](/architecture/) and the two systems share no code.

The `feature_flags` table is read through `isFlagEnabled()`, wrapped in React's
`cache()` so a flag costs one query per request no matter how many components ask.
Admins toggle flags at `/flags` in the admin app. New flags follow a seeded-off
convention: shipping a feature dark and enabling it deliberately is one UPDATE, and
a fresh install starts safe.

The kit uses its own flag system for real behavior, for example `ui.brand_theming`
gates the [runtime theming engine](/features/theming/) and `mobile.update_check`
gates native version enforcement.

## Health and maintenance

Both apps expose an unauthenticated `/api/health` returning version and a
timeout-bounded database probe, suitable for uptime monitors. A daily cron prunes
expired password-reset, email-verification, TOTP-pending, and invite tokens, and
returns 503 when misconfigured rather than silently doing nothing, so a broken
schedule is visible in your hosting dashboard.
