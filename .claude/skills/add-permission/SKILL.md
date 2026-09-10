---
name: add-permission
description: Add a new feature permission to FEATURE_CATALOG in packages/permissions and optionally bind it to a role on next seed
argument-hint: "[permission.key]"
---

# Add Feature Permission

When the user invokes `/add-permission`, walk through adding a new feature permission to the kit's permission system. The permission key may be provided as `$ARGUMENTS` (e.g., `audit.read`).

`FEATURE_CATALOG` in `packages/permissions/src/index.ts` is the source of truth. The seed script (`packages/db/src/seed.ts`) reads this catalog and inserts each feature into the `features` table. Role bindings happen in the seed too. **The catalog in code — not the database — is the source of truth for what features exist**; the admin roles UI renders directly from it.

## Step 1: Gather Information

Ask the user (if not already provided):

1. **Permission key** — dot-notation (e.g., `audit.read`, `users.invite`, `tickets.triage`).
2. **Constant name** — UPPER_SNAKE_CASE for the `FEATURES` object (e.g., `AUDIT_READ`).
3. **Human-readable name** — for the admin UI (e.g., "Read audit log").
4. **Description** — one sentence; shown next to the name in the admin roles editor.
5. **Category** — usually `admin`; add a new category if the feature belongs to a non-admin surface.
6. **Default roles** — which roles get this permission on a fresh seed? Usually `admin`. Sometimes also `member`. Rarely none (assigned manually).
7. **Admin-protected?** — if losing this permission would lock admins out of the admin app, add it to `ADMIN_PROTECTED_FEATURES` (the anti-lockout list the roles UI refuses to remove from the admin role).

## Step 2: Update `packages/permissions/src/index.ts`

Add the new key to the `FEATURES` constant:

```typescript
export const FEATURES = {
  // ... existing entries ...
  AUDIT_READ: "audit.read",
} as const;
```

Add the matching `FEATURE_CATALOG` entry:

```typescript
{
  key: FEATURES.AUDIT_READ,
  name: "Read audit log",
  description: "View the append-only audit log of security-sensitive actions.",
  category: "admin",
},
```

Keep the catalog entries in the same order as the `FEATURES` constant — it makes review diffs easier to read.

## Step 3: Wire the Default Role Binding (Optional)

If the new permission should be granted to a role on a fresh seed, edit `packages/db/src/seed.ts` and add the feature key to that role's binding list. The seed is idempotent — re-running it is safe.

For an existing database, the seed will only *add* the binding; it will not revoke it from any role that already has the permission via custom assignment. That's the right behavior.

## Step 4: Apply the Change Locally

```bash
pnpm db:seed
```

This inserts the new row into `features` and (if you updated the seed) binds it to the configured roles.

## Step 5: Use the New Permission

**API route handler / server action:**
```typescript
import { auth } from "@/auth";
import { FEATURES, hasFeature } from "@repo/permissions";

const session = await auth();
if (!hasFeature(session?.user?.features, FEATURES.AUDIT_READ)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

**UI conditional render:**
```typescript
const canRead = hasFeature(session?.user?.features, FEATURES.AUDIT_READ);
{canRead && <AuditLogPanel />}
```

**Remember the invariant:** a permission answers "is this *user* allowed to do X?" A feature *flag* answers "is X *turned on* here?" A flag never gates a permission (AGENTS.md → Key Invariants).

## Step 6: Document and Release-Note

- Update `docs/product/functionality-map.md` if the permission gates a new capability.
- Run `/release-notes` to record the new permission in the current release notes file.

## Summary

Present what changed:

- New `FEATURES.<KEY>` constant in `packages/permissions`
- New `FEATURE_CATALOG` entry (name, description, category)
- `ADMIN_PROTECTED_FEATURES` updated: yes / no
- Seed binding updated (which roles get it on fresh install): yes / no
- Local seed run: PASS / FAIL
- Files modified
