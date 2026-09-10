---
title: Module Catalog
description: What personalization can keep or strip.
---

Modules are the unit of personalization. Each is registered in `scripts/kit/module-registry.json` with everything needed to remove it cleanly: paths, workspace entries, dependencies, `-- MODULE:`-tagged migrations, flag seeds, feature keys, env vars, and doc anchors.

## Apps

| Module | Default | Notes |
|---|---|---|
| `portal` | required | The kit's spine — everything else hangs off it |
| `admin` | on | Control plane: users, roles, flags, audit, triage, branding |
| `shell` | on | Capacitor wrapper; needs Apple/Google developer accounts to ship |
| `mobile` | on | Expo app; needs EAS + store accounts to ship |
| `docs-site` | on | This site's skeleton, rebranded for your project |

## Features

| Module | Default | What it includes |
|---|---|---|
| `helpdesk` | on | Tickets, threaded messages, action timeline, admin triage queue, feedback promotion |
| `feedback` | on | In-app feedback form, daily prompt card, admin triage |
| `twoFactor` | on | TOTP enrollment, recovery codes, trusted devices, per-user enforcement |
| `oidc` | on | Generic OIDC provider slot (Okta/Entra/Auth0 via env vars) |
| `emailQueue` | on | Queued sending with retry/backoff, admin viewer, delivery webhooks |
| `whatsNew` | on | Release announcements with seen-tracking |
| `flagsAdmin` | on | The flags admin UI (flag *infrastructure* is core and not removable) |
| `auditViewer` | on | The audit log admin UI (audit *writes* are core and not removable) |

## Not removable

Auth core, the permission model, flag infrastructure, audit writes, the brand engine, migrations discipline, and the workflow/enforcement stack. These are the kit's guarantees; removing them would make the remaining scaffold unsound.
