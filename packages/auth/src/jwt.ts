import { eq } from "drizzle-orm";
import type { Db, IdentitySchema } from "@repo/db";
import { users, userRoles, roles, roleFeatures, features, userTotp } from "@repo/db";
import { ADMIN_ROLE } from "@repo/permissions";

export type SharedJwtClaims = {
  isActive: boolean;
  twoFactorRequired: boolean;
  email: string | null;
  mustChangePassword: boolean;
  hasTotp: boolean;
  /**
   * Session-freshness stamp. Read unconditionally from `users.rolesVersion`
   * on every call — bumped by a DB trigger on `user_roles` whenever a role
   * grant/revoke changes this user's row. Callers thread the JWT's own
   * previously-carried value back in as `opts.currentRolesVersion`; a
   * mismatch forces `roles`/`features` to be re-derived THIS request even
   * when `refreshRoles` alone said no. This is what closes the
   * revocation-staleness gap: revoking a role takes effect on the revoked
   * user's very next request instead of their next sign-in.
   */
  rolesVersion: number;
  /** Only populated when roles were (re)derived — see call contract below. */
  roles: string[] | undefined;
  features: string[] | undefined;
};

/**
 * Computes the identity claims that are identical in shape for every app on
 * every authenticated request. This doubles as the stale-JWT defense: the
 * cheap per-request SELECT notices a deleted or deactivated user and returns
 * null, which the caller turns into an empty token (signed out on the next
 * request).
 *
 * Each app's own `jwt` callback (in its own `src/auth.ts`) calls this once
 * per request and merges the result onto `token`:
 *
 *   const claims = await computeSharedJwtClaims(db, token.sub, {
 *     featureKeys: Object.values(FEATURES),
 *     refreshRoles: !token.roles || trigger === "update" || !!user,
 *     currentRolesVersion: token.rolesVersion,
 *   });
 *   if (!claims) return {}; // row vanished or deactivated -> sign out
 *   token.isActive = claims.isActive;
 *   token.twoFactorRequired = claims.twoFactorRequired; // app may recompute
 *     // an "effective" value on top (e.g. the auth.require_2fa flag)
 *   token.mustChangePassword = claims.mustChangePassword;
 *   token.hasTotp = claims.hasTotp;
 *   token.rolesVersion = claims.rolesVersion;
 *   if (claims.roles) token.roles = claims.roles;
 *   if (claims.features) token.features = claims.features;
 *
 * `featureKeys` is the caller's full catalog (Object.values(FEATURES)) so
 * this module stays decoupled from the exact FEATURES shape beyond needing
 * "all keys" for the admin bypass — the DB is NOT the source of truth for
 * the admin grant, the code is.
 *
 * `refreshRoles` is the stale-JWT-defense optimization: roles/features are
 * only re-queried on first sign-in, an explicit `unstable_update()` call, or
 * when the token doesn't have them yet — not on every request. When false,
 * `roles`/`features` come back `undefined` and the caller should leave the
 * existing token values untouched.
 *
 * Returns `null` if the user row is gone or deactivated — the caller should
 * return an empty token (signs the user out on the next request).
 *
 * Generic over `TSchema` so an app can call this with its own wider-schema
 * `db` (see @repo/db's `IdentitySchema` export). Uses `.select().from(...)`
 * rather than the `db.query.*` relational builder — the latter's return type
 * is keyed off `ExtractTablesWithRelations<TSchema>`, which can't be
 * resolved while TSchema is still an unresolved generic parameter here.
 */
export async function computeSharedJwtClaims<TSchema extends IdentitySchema = IdentitySchema>(
  db: Db<TSchema>,
  userId: string,
  opts: {
    featureKeys: string[];
    refreshRoles: boolean;
    /**
     * The `rolesVersion` value already carried on this request's JWT, if
     * any. When it doesn't match the freshly-read DB value, `roles`/
     * `features` are re-derived THIS request even though `refreshRoles`
     * alone said no. `undefined` (first sign-in) never counts as a mismatch
     * on its own — `refreshRoles`'s `!token.roles` condition already covers
     * that case.
     */
    currentRolesVersion?: number;
  },
): Promise<SharedJwtClaims | null> {
  const [dbUser] = await db
    .select({
      isActive: users.isActive,
      twoFactorRequired: users.twoFactorRequired,
      email: users.email,
      mustChangePassword: users.mustChangePassword,
      rolesVersion: users.rolesVersion,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!dbUser || !dbUser.isActive) return null;

  const [totpRow] = await db
    .select({ userId: userTotp.userId })
    .from(userTotp)
    .where(eq(userTotp.userId, userId))
    .limit(1);

  let roleNames: string[] | undefined;
  let userFeatures: string[] | undefined;

  // versionStale: the JWT's own carried stamp disagrees with the value just
  // read — a role grant/revoke happened to this user since this token last
  // refreshed roles/features. A SECOND, INDEPENDENT reason to refresh,
  // additive to (never a replacement for) `opts.refreshRoles`.
  const versionStale =
    opts.currentRolesVersion !== undefined &&
    opts.currentRolesVersion !== dbUser.rolesVersion;
  const shouldRefreshRoles = opts.refreshRoles || versionStale;

  if (shouldRefreshRoles) {
    const roleRows = await db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId))
      .orderBy(roles.sortOrder);
    roleNames = roleRows.map((r) => r.name);

    if (roleNames.includes(ADMIN_ROLE)) {
      // Admins receive every key in the caller's static FEATURE_CATALOG, not
      // every row in the `features` table. The DB is *not* the source of
      // truth for the admin grant — the code is.
      userFeatures = opts.featureKeys;
    } else if (roleNames.length > 0) {
      const featRows = await db
        .selectDistinct({ key: features.key })
        .from(roleFeatures)
        .innerJoin(roles, eq(roleFeatures.roleId, roles.id))
        .innerJoin(userRoles, eq(userRoles.roleId, roles.id))
        .innerJoin(features, eq(roleFeatures.featureKey, features.key))
        .where(eq(userRoles.userId, userId));
      userFeatures = featRows.map((f) => f.key);
    } else {
      userFeatures = [];
    }
  }

  return {
    isActive: dbUser.isActive,
    twoFactorRequired: dbUser.twoFactorRequired,
    email: dbUser.email,
    mustChangePassword: dbUser.mustChangePassword,
    hasTotp: !!totpRow,
    rolesVersion: dbUser.rolesVersion,
    roles: roleNames,
    features: userFeatures,
  };
}
