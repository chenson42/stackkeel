import { APP_ROLE_NAMESPACES } from "@repo/permissions";

/**
 * The admin app's own role namespace — read from @repo/permissions'
 * APP_ROLE_NAMESPACES so this list can never drift from the shared
 * catalog. Used ONLY by this app's own root-level access gate (an
 * authenticated session with zero admin-app roles -> /access-pending —
 * src/proxy.ts and the (app) layout). Do NOT use this for the
 * cross-namespace check inside role mutations — that is @repo/permissions'
 * wider isKnownRoleName() allowlist: this app's whole purpose is
 * legitimate cross-namespace assignment, so the mutation-side check must
 * never be narrowed to just this list.
 */
export const ADMIN_APP_ROLE_NAMES: readonly string[] = APP_ROLE_NAMESPACES.admin;

/** True if `roleName` grants access to the admin app itself. */
export function isAdminAppRole(roleName: string): boolean {
  return ADMIN_APP_ROLE_NAMES.includes(roleName);
}
