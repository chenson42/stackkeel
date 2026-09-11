import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./identity";

/**
 * Runtime brand state — module `core` (NOT strippable: the brand engine is
 * one of the kit's guarantees; migrations/0007_branding.sql).
 *
 * Single-tenant: exactly ONE brand row, id locked to 'default' by a CHECK.
 * The row stores only the *inputs* to the brand system (seed hex, type
 * pairing, scheme policy) — never generated token values. Tokens are
 * derived at render time by @repo/brand's pure generator, pinned by
 * brandTokenVersion so a future generator improvement cannot silently
 * re-skin a deployment that hasn't opted in.
 *
 * No row at all is a valid state: the apps then render the static Starter
 * palette from packages/ui/src/theme.css and the BrandTokens emitter
 * renders null.
 */

export const branding = pgTable(
  "branding",
  {
    // Single-row table: the only legal id is 'default'.
    id: text("id").primaryKey().default("default"),
    seedHex: text("seed_hex").notNull(),
    // One of @repo/brand's TYPE_PAIRINGS ids. Open font selection is
    // deliberately rejected — see BRANDING.md.
    typePairing: text("type_pairing").notNull().default("classic"),
    // true = the brand declines a dark scheme; apps render light only.
    lightOnly: boolean("light_only").notNull().default(false),
    brandTokenVersion: integer("brand_token_version").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    check("branding_single_row", sql`${t.id} = 'default'`),
    check("branding_seed_hex_format", sql`${t.seedHex} ~ '^#[0-9a-f]{6}$'`),
  ],
);

// Append-only change history ('updated' snapshots — there is no 'created'
// event: the first save IS an update to the brand, and a never-branded
// deployment has no history to explain).
export const brandingHistory = pgTable("branding_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  seedHex: text("seed_hex").notNull(),
  typePairing: text("type_pairing").notNull(),
  lightOnly: boolean("light_only").notNull(),
  brandTokenVersion: integer("brand_token_version").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  changedBy: uuid("changed_by").references(() => users.id, {
    onDelete: "set null",
  }),
});
