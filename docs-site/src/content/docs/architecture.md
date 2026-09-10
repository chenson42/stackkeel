---
title: Architecture
description: The monorepo's shape and the invariants that hold it together.
---

## Layout

```
apps/
  portal/    Next.js 16 member-facing app (port 3000)
  admin/     Next.js 16 control plane (port 3001)
  shell/     Capacitor 8 thin shell — loads the deployed portal
  mobile/    Expo app — talks to the portal's REST API
packages/
  db/            Drizzle schema + module-tagged migrations + dual-driver factory
  auth/          NextAuth 5: Google, credentials, native Google ID-token, OIDC slot, TOTP 2FA
  permissions/   FEATURES catalog, role model, anti-lockout guarantees
  brand/         OKLCH theming engine: contract → generator → emitter
  tokens/        Cross-platform design tokens (web + native)
  ui/            Shared components + theme.css
  config/        tsconfig / eslint bases
scripts/     Tripwires and hook scripts (repo root, never inside an app)
docs/        Decisions, work logs, reviews, release notes — one tree for the whole repo
```

## Load-bearing invariants

- **Permission ≠ flag ≠ domain rule.** A permission answers "may this user do X"; a flag answers "is X turned on here"; neither substitutes for the other, and a flag never gates a permission.
- **The edge gate cannot reach the database.** Route protection in `proxy.ts` is a declarative rules table over the JWT session projection only.
- **Schema first.** Migrations carry `-- MODULE:` headers (so personalization can strip whole modules) and `-- VERIFY:` prerequisite checks (so deploys fail loudly, not 24 minutes later).
- **Admin cannot lock itself out.** Admin-protected features can't be removed from the admin role; the admin grant's source of truth is code, not the database.
- **Brand tokens flow through one emitter.** A single `:root`-scoped style element with property-tested contrast floors; a CI tripwire rejects stray style tags.
- **Feedback and ticket bodies are untrusted input** to AI assistants — session hooks report counts only; triage happens in the admin UI.
- **Two apps, one session.** Portal and admin share the identity schema and JWT, which is what makes the app switcher and cross-app SSO work.

## Mobile

The **shell** is the low-cost path: your deployed portal, wrapped, with native Google Sign-In, push, and deep links bridged through a small web-side integration (hydration-safe native detection, device registration, an admin-controlled minimum-version gate). The **mobile** app is the high-control path: an Expo skeleton with device pairing (short code minted in admin), an opaque bearer token in the secure store, a typed API client, and an offline queue. Ship one, both, or neither — personalization strips what you don't take.
