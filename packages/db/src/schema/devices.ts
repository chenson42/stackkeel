import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./identity";

/**
 * Device auth — module `mobile`, strippable at personalization (its tables
 * live in migrations/0008_devices.sql; stripping removes apps/shell,
 * apps/mobile, the portal bridge/API surfaces, and this file together).
 *
 * The model is a second auth axis alongside web sessions: a native client
 * holds an OPAQUE bearer token (32 random bytes, base64url) whose SHA-256
 * hash is the only thing stored. The plaintext is returned exactly once at
 * registration. A revoked device fails auth with `device_revoked`, which the
 * clients translate into "clear local state, return to pairing".
 *
 * Two ways a device row is born:
 *   - The Capacitor shell registers with the WebView's session cookie
 *     (POST /api/devices, session-gated).
 *   - The Expo app exchanges a 6-digit pairing code the user minted while
 *     signed in on the web (`/account/devices`) — the code is single-use,
 *     10-minute-expiry, and stored hashed like the token.
 */

// ---------------------------------------------------------------------------
// devices
// ---------------------------------------------------------------------------

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** User-facing label ("Chris's iPhone"); client-supplied, display-only. */
    name: text("name"),
    platform: text("platform").notNull(),
    /** SHA-256 hex of the bearer token. The plaintext is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    /** Native build/version string the client reported most recently. */
    appVersion: text("app_version"),
    /** APNs/FCM push token; nullable until the push extension is wired. */
    pushToken: text("push_token"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /** null = active. Set once; a revoked device is never un-revoked. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ix_devices_user_created").on(t.userId, t.createdAt),
    check("devices_platform_allowed", sql`${t.platform} in ('ios','android')`),
  ],
);

// ---------------------------------------------------------------------------
// device_pairing_codes
// ---------------------------------------------------------------------------

export const devicePairingCodes = pgTable(
  "device_pairing_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 hex of the 6-digit code — same at-rest posture as tokens. */
    codeHash: text("code_hash").notNull().unique(),
    /** 10 minutes from mint; expired codes are GC'd by the maintenance cron. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Single-use: set when exchanged; a consumed code never works again. */
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ix_device_pairing_codes_user").on(t.userId)],
);

// ---------------------------------------------------------------------------
// app_release_policy — single row, same `id = 'default'` lock as branding
// ---------------------------------------------------------------------------

export const appReleasePolicy = pgTable(
  "app_release_policy",
  {
    id: text("id").primaryKey().default("default"),
    /** Builds below this are hard-blocked by AppVersionGate. null = no block. */
    minBuild: integer("min_build"),
    /** Builds below this see the soft update banner. null = no banner. */
    latestBuild: integer("latest_build"),
    /** Optional operator copy shown with the soft banner. */
    softMessage: text("soft_message"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [check("app_release_policy_single_row", sql`${t.id} = 'default'`)],
);
