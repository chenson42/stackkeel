import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Deliberately NO `relations()` definitions in this file. This package owns
// table/column shape only — Drizzle's relational query builder `with: {...}`
// graph stays defined once, in whichever app owns the fuller object graph, so
// two separate `relations(users, ...)` calls for the same table never risk one
// silently overwriting the other in the schema object passed to drizzle().
// Shared code here uses plain `eq()`/`.innerJoin()` queries, never `with`.

// NextAuth adapter tables. snake_case property names on `accounts` are
// required by @auth/drizzle-adapter — do not rename.

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  password: text("password"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  twoFactorRequired: boolean("two_factor_required").notNull().default(true),
  // Force a password change after first login / admin reset. Credentials-only
  // concept; always false for OAuth-native users.
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  // Sign-in eligibility as identity-level data: 'invited' = created by an
  // admin, not yet able to sign in (no password set / no first OAuth sign-in
  // completed); 'active' = can sign in. Text, not pgEnum — project convention.
  accountStatus: text("account_status").notNull().default("active"), // 'invited' | 'active'
  // Session-freshness stamp. Bumped by a DB trigger on `user_roles`
  // INSERT/UPDATE/DELETE (migrations/0000_core.sql) whenever a role
  // grant/revoke changes this user's rows. packages/auth/src/jwt.ts's
  // `computeSharedJwtClaims` compares this against the value already carried
  // on the request's JWT to decide whether roles/features need re-deriving
  // THIS request — this is what bounds "revoke a role" to "takes effect on
  // the target's next request" instead of "at their next sign-in." Never
  // written by application code, only by the trigger.
  rolesVersion: integer("roles_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// Roles → features (permissions). Multiple roles per user. Each role grants
// a set of features. Features are the unit checked at runtime — see
// @repo/permissions for the catalog and the permission ≠ flag ≠ domain-rule
// distinction.

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// An unconditional trigger lives on this table — every INSERT/UPDATE/DELETE,
// any role — bumping `users.rolesVersion` for the affected user(s). See
// `rolesVersion`'s own comment above and migrations/0000_core.sql.
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("ix_user_roles_user_role").on(t.userId, t.roleId)],
);

export const features = pgTable("features", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
});

export const roleFeatures = pgTable(
  "role_features",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    featureKey: text("feature_key")
      .notNull()
      .references(() => features.key, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("ix_role_features_role_feature").on(t.roleId, t.featureKey),
  ],
);

// TOTP 2FA. Secret stored AES-256-GCM encrypted; see packages/auth/src/two-factor.ts.

export const userTotp = pgTable("user_totp", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  secretCiphertext: text("secret_ciphertext").notNull(),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

// Pending enrollments. The user has scanned a QR code but not yet confirmed
// the first 6-digit code. Holding the ciphertext server-side closes the
// "client posts back any secret it wants" gap. One row per user; expires after
// 10 minutes to keep dead rows from accumulating.
export const userTotpPendingEnrollments = pgTable(
  "user_totp_pending_enrollments",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    secretCiphertext: text("secret_ciphertext").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const userTotpRecoveryCodes = pgTable(
  "user_totp_recovery_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ix_recovery_user").on(t.userId)],
);

// No relations() here — see the file header note above.
