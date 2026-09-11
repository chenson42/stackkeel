---
title: Roles and Permissions (RBAC) for Next.js
description: "Stackkeel's role-based access control: a code-defined feature catalog, role-to-feature bindings edited in the admin panel, an admin role that cannot lock itself out, and a clean separation between permissions, feature flags, and domain rules."
---

Access control in Stackkeel is one model used everywhere: roles grant features,
features gate behavior, and the catalog of features lives in code where it can be
reviewed, typed, and tested (`packages/permissions/src/index.ts`).

## The model

```
roles ──< user_roles >── users
  └──< role_features >── features
```

A feature key like `admin.users` or `tickets.file` is the unit of permission.
`hasFeature(session, key)` answers the only question that matters at a gate: may
this user do this thing? The catalog entry carries a name, description, and
category, and the admin UI renders directly from it, so adding a permission is one
code change plus a seed.

## Anti-lockout, by construction

Two guarantees keep an admin from sawing off the branch they sit on:

- The **admin role's grant comes from code, not the database**. A corrupted or
  mis-seeded `role_features` table cannot strip administrators of admin features.
- `ADMIN_PROTECTED_FEATURES` (which includes the role-editing screen itself) can
  never be removed from the admin role. The roles matrix in the admin app renders
  those cells permanently checked and disabled.

## Editing roles

The admin app's Roles screen is a role-by-feature matrix backed by audited server
actions. User detail pages assign roles per user. Every change writes an audit
event, and role freshness is enforced with a version stamp on the user row, so a
revoked role takes effect on the next request rather than at next sign-in.

## Three mechanisms, kept apart

A recurring source of authorization bugs is conflating three different questions.
Stackkeel's invariants keep them separate:

| Question | Mechanism |
|---|---|
| May this **user** do X? | Permission: `FEATURES` + `hasFeature()` |
| Is X **turned on** in this environment? | Flag: `feature_flags` + `isFlagEnabled()` |
| May this user touch this **record**? | A pure predicate function in that domain |

A flag never gates a permission, and vice versa. The
[audit log and feature flags page](/features/audit-and-flags/) covers the second row.
