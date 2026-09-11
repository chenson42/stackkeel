// apps/admin/src/lib/roles-version.ts
//
// Origin: apps/admin/docs/work-log/2026-09-09-roles-permissions-ux.md
// Phase 3 § 2 ("The write path, including the rolesVersion fix").
//
// packages/db/migrations/0004_roles_version_trigger.sql's own header names
// this exact gap explicitly: the trigger bumping `users.roles_version`
// fires on `user_roles` writes only (WHO holds which role) — it does NOT
// fire when an admin changes WHAT a role grants (a `role_features` write).
// Confirmed again this pass by reading packages/auth/src/jwt.ts:1-178 in
// full: computeSharedJwtClaims() only re-derives roles/features when
// `refreshRoles` is true OR `token.rolesVersion !== dbUser.rolesVersion`
// (`versionStale`) — and `rolesVersion` only ever moves via that
// `user_roles`-scoped trigger. Without this file, every toggle on the new
// /roles page (role x feature grid) has ZERO effect on any already-signed-
// in user's session until they happen to sign out and back in.
//
// Call bumpRolesVersionForRole() after every successful role_features
// insert/delete (apps/admin/src/lib/role-grant.ts's grantOrRevokeRoleFeature,
// api-developer's slice) AND once from seedRoleFeatures() below, for
// admin specifically, so already-signed-in admins see the new
// FEATURES.ADMIN_ROLES grant without signing out (see this file's own
// seed-shared-roles.ts call site for why that ordering matters).
//
// Deliberately does NOT carry `import "server-only"`, unlike role-grant.ts /
// audit.ts: this needs to be importable from both a Server Action
// (role-grant.ts, a Next.js/Node runtime) AND a plain `tsx` script
// (seed-shared-roles.ts, run via `npx tsx`, no Next.js bundler in the
// loop). `server-only`'s package throws at import time outside Next's own
// bundler substitution — importing a server-only-guarded module from a
// standalone script fails immediately. This file has no Next-specific or
// request-scoped code (no auth(), no headers(), no cookies()), so the
// guard is genuinely unneeded here, not just omitted for convenience.
//
// WHY A CODE-LEVEL BUMP, NOT A WIDENED DB TRIGGER (Phase 3 § 2's own
// ruling, restated once here per Writeup Discipline rather than only in
// the work-log): a trigger on role_features (mirroring 0004's shape,
// joining through user_roles to find affected users) was considered and
// rejected — new DDL re-opens the exact environment-sync risk this
// feature's own category-rename migrations (0005/0006) already carry, and
// unlike user_roles (written by every app independently), role_features
// will have exactly one writer after this ships: this action, plus this
// seed script running once at bootstrap. A single, well-tested write path
// doing the bump in code carries the identical guarantee with zero new
// migration risk.
//
// RAW-SQL SHAPE — db.execute(sql`...`) is an established precedent in this
// app, not a new idiom: apps/admin/src/lib/cross-app-audit.ts:77,184 both
// call db.execute(sql`...`) already (confirmed by direct grep this pass —
// Phase 3 flagged this as unverified; closing that gap here).
//
// GENERIC OVER TSchema — a divergence from Phase 3's own code sample,
// which typed this as a plain `db: Db` parameter. Confirmed wrong by this
// pass's own entry check: apps/admin/src/lib/db/index.ts's `db` is built
// from THIS APP'S OWN wider schema module (createDb(url, schema) — 11
// shared identity tables plus account_requests/admin_invite_tokens/
// audit_events plus every relations()), which is not structurally
// assignable to `Db`'s default `TSchema = typeof identitySchema` — the
// exact bug apps/portal/src/lib/auth/second-factor-policy.ts already hit
// and documented for an identically-shaped helper ("A non-generic `db: Db`
// parameter here would reject Portal's own `db` value at every call
// site... This is a correction found during Phase 4's entry check, not
// what Phase 3's own code sample showed"). Same fix, same reason, applied
// here before it was ever wired to a real call site.
import { sql } from "drizzle-orm";
import type { Db, IdentitySchema } from "@repo/db";

/**
 * Bumps `users.roles_version` for every user currently holding `roleId`.
 * Unconditional on whether a role_features row actually changed — the
 * caller (grantOrRevokeRoleFeature) only invokes this after a real change,
 * so a no-op re-toggle never burns a version bump on every user of that
 * role for nothing.
 */
export async function bumpRolesVersionForRole<
  TSchema extends IdentitySchema = IdentitySchema,
>(db: Db<TSchema>, roleId: string): Promise<void> {
  await db.execute(sql`
    UPDATE users SET roles_version = roles_version + 1
    WHERE id IN (SELECT user_id FROM user_roles WHERE role_id = ${roleId})
  `);
}
