/**
 * Shared FEATURES catalog + hasFeature(). Pure and DB/Next-free by design —
 * `requireFeature()` deliberately does NOT live here (it's Next.js-coupled
 * and app-specific; each app keeps its own thin wrapper).
 *
 * THREE MECHANISMS, KEPT APART (AGENTS.md → Key Invariants):
 *   - Permission — FEATURES + hasFeature(): "is this USER allowed to do X?"
 *   - Flag — feature_flags + isFlagEnabledFor(): "is X TURNED ON here?"
 *   - Domain rule — an app's own pure functions over its own data.
 * A flag never gates a permission, and neither substitutes for the other.
 */

/**
 * Reserved name of the role that bypasses per-feature checks and is treated
 * as "has every feature in the catalog." A single source of truth — never
 * inline the literal `"admin"` in code or middleware.
 */
export const ADMIN_ROLE = "admin" as const;
/** Default role for signed-up users. */
export const MEMBER_ROLE = "member" as const;

export const FEATURES = {
  // Admin app surfaces. One key per separately-revocable privilege — do not
  // fold two admin pages onto one key unless revoking them apart makes no
  // sense.
  ADMIN_DASHBOARD: "admin.dashboard",
  ADMIN_USERS: "admin.users",
  // Separate from ADMIN_USERS: editing WHAT a role grants (role_features) is
  // a categorically larger blast radius than assigning an EXISTING role to
  // one user — the moment a role_features write lands it silently changes
  // the effective permissions of every holder of that role.
  ADMIN_ROLES: "admin.roles",
  ADMIN_FLAGS: "admin.flags",
  // Reading every app's audit trail is a materially broader privilege than
  // managing users; separately grantable.
  ADMIN_AUDIT: "admin.audit",
  // User-authored free text is its own privacy class; separately revocable.
  ADMIN_FEEDBACK: "admin.feedback",
  ADMIN_EMAIL_QUEUE: "admin.email_queue",
  ADMIN_WHATS_NEW: "admin.whats_new",
  // Helpdesk triage (cross-user ticket queue, assignment, replies).
  ADMIN_TICKETS: "admin.tickets",
  ADMIN_BRANDING: "admin.branding",
  // Device management (native-app pairing, revocation, release policy).
  ADMIN_DEVICES: "admin.devices",
  ADMIN_RELEASE_NOTES: "admin.release_notes",
  // Portal-side: may file helpdesk tickets. (Baseline feedback needs no
  // permission at all — deliberate: the no-gate on-ramp.)
  TICKETS_FILE: "tickets.file",
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

export const FEATURE_CATALOG: Array<{
  key: FeatureKey;
  name: string;
  description: string;
  category: string;
}> = [
  {
    key: FEATURES.ADMIN_DASHBOARD,
    name: "Admin dashboard",
    description: "Access the admin app's landing page.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_USERS,
    name: "Manage users",
    description: "View users, invite users, and assign existing roles.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_ROLES,
    name: "Manage role permissions",
    description:
      "Edit which permissions each role grants. Broader blast radius than assigning roles to a user.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_FLAGS,
    name: "Manage feature flags",
    description: "View and toggle platform-wide and per-app feature flags.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_AUDIT,
    name: "Audit log",
    description: "Read the append-only audit trail across all apps.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_FEEDBACK,
    name: "Triage feedback",
    description: "View and triage user feedback across all apps.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_EMAIL_QUEUE,
    name: "Email queue",
    description: "View the outbound email queue and retry failed sends.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_WHATS_NEW,
    name: "What's new",
    description: "Create, edit, and delete What's new entries visible to users.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_TICKETS,
    name: "Helpdesk triage",
    description:
      "View the cross-user ticket queue, assign, reclassify, prioritize, and reply as an operator.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_BRANDING,
    name: "Manage branding",
    description: "Edit the brand seed color, type pairing, and marks.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_DEVICES,
    name: "Manage devices",
    description:
      "Pair, list, and revoke native-app devices, and edit the app release policy.",
    category: "admin",
  },
  {
    key: FEATURES.ADMIN_RELEASE_NOTES,
    name: "Read release notes",
    description: "View release notes from the admin docs page.",
    category: "admin",
  },
  {
    key: FEATURES.TICKETS_FILE,
    name: "File support tickets",
    description: "File helpdesk tickets and reply to own ticket threads.",
    category: "portal",
  },
];

/**
 * Anti-lockout floor: features that can never be revoked from the admin
 * role. Removing any of these would lock every operator out of the exact
 * page that could restore them. The admin roles editor must refuse to
 * remove these from ADMIN_ROLE (and the check is enforced server-side in
 * the mutation, not just hidden in the UI).
 */
export const ADMIN_PROTECTED_FEATURES: readonly FeatureKey[] = [
  FEATURES.ADMIN_DASHBOARD,
  FEATURES.ADMIN_USERS,
  FEATURES.ADMIN_ROLES,
] as const;

/**
 * Features granted to the member role by the seed (insert-only — a reseed
 * never re-grants what an operator has since revoked).
 */
export const MEMBER_DEFAULT_FEATURES: readonly FeatureKey[] = [
  FEATURES.TICKETS_FILE,
] as const;

export function hasFeature(
  userFeatures: string[] | undefined,
  required: FeatureKey,
): boolean {
  return Array.isArray(userFeatures) && userFeatures.includes(required);
}

/**
 * Which role names belong to which app — the app-switcher and per-app route
 * gates consume this bidirectionally. Fail-closed by construction: a role
 * name that doesn't literally appear here never satisfies hasRoleInApp for
 * ANY app — a malformed/orphaned/typo role name can only ever fail to grant
 * visibility, never wrongly grant it. Forks add their own namespaced roles
 * here as their product grows.
 */
export const APP_ROLE_NAMESPACES = {
  portal: [ADMIN_ROLE, MEMBER_ROLE],
  admin: [ADMIN_ROLE],
} as const satisfies Record<string, readonly string[]>;

export type AppId = keyof typeof APP_ROLE_NAMESPACES;

/** Flat union of every known role name across every app namespace. */
export const KNOWN_ROLE_NAMES: readonly string[] = [
  ...new Set(Object.values(APP_ROLE_NAMESPACES).flat()),
];

/** True if `roleName` belongs to any known, allowlisted app namespace. */
export function isKnownRoleName(roleName: string): boolean {
  return KNOWN_ROLE_NAMES.includes(roleName);
}

/** True if any of `roleNames` (e.g. `session.user.roles`) belongs to `app`. */
export function hasRoleInApp(
  roleNames: string[] | undefined,
  app: AppId,
): boolean {
  if (!roleNames) return false;
  const namespace: readonly string[] = APP_ROLE_NAMESPACES[app];
  return roleNames.some((r) => namespace.includes(r));
}
