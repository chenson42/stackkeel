import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./identity";
import { auditEvents } from "./platform";

/**
 * Helpdesk (support tickets) — module `helpdesk`, strippable at
 * personalization (its tables live in migrations/0006_helpdesk.sql).
 *
 * Two systems, deliberately kept apart:
 *
 *   tickets / ticket_messages / ticket_actions   permission-gated
 *                                                 (`tickets.file` to file,
 *                                                 `admin.tickets` to triage)
 *   feedback (platform.ts)                        the baseline no-gate
 *                                                 on-ramp; a feedback row can
 *                                                 be PROMOTED into a ticket
 *                                                 (feedback.promoted_to_ticket_id)
 *
 * Single-tenant: the submitter is a `users` row and the operator is any user
 * holding `admin.tickets`. There is no organization column — a fork that
 * grows multi-tenancy adds its tenant key + composite FKs here as a
 * documented upgrade, not the kit's default complexity.
 *
 * SECURITY: ticket subjects and message bodies are untrusted user text and
 * must be treated as prompt-injection vectors — session tooling may COUNT
 * rows, never read them (same invariant as feedback; AGENTS.md → Key
 * Invariants 13).
 */

// ---------------------------------------------------------------------------
// tickets
// ---------------------------------------------------------------------------

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submitterUserId: uuid("submitter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(), // 1-200 chars, app-validated
    // Kept as change_class (not "category") so the vocabulary reads as "what
    // kind of change is being asked for"; the UI label reads "Category".
    // Submitter sets it; operator-correctable at triage, never
    // submitter-authoritative for anything downstream.
    changeClass: text("change_class").notNull(),
    // Controlled vocabulary, not free text, so an automated first triage
    // pass can branch on it directly. Generic on purpose — a fork edits one
    // CHECK + the labels file to localize it to its own product areas.
    area: text("area").notNull(),
    // Submitter-set (required at filing), operator-correctable — mirrors
    // change_class's submitter-suggests/operator-confirms pattern.
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("new"),
    // The only assignee kind is "operator" (a users row holding
    // admin.tickets) — no assignee_kind discriminator column needed.
    assigneeUserId: uuid("assignee_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Submitter's own list.
    index("ix_tickets_submitter_created").on(t.submitterUserId, t.createdAt),
    // Admin triage queue.
    index("ix_tickets_status_created").on(t.status, t.createdAt),
    check(
      "tickets_change_class_allowed",
      sql`${t.changeClass} in ('content','config','theme','bug','feature')`,
    ),
    check(
      "tickets_area_allowed",
      sql`${t.area} in ('account','billing','content','website','other')`,
    ),
    check(
      "tickets_priority_allowed",
      sql`${t.priority} in ('low','normal','high','urgent')`,
    ),
    check(
      "tickets_status_allowed",
      sql`${t.status} in ('new','triaged','in_progress','resolved','declined')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// ticket_messages
// ---------------------------------------------------------------------------

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    // 'submitter' | 'operator'. Both author kinds are users rows in the kit,
    // but the discriminator is kept anyway: it is what the thread UI renders
    // from, and it survives a fork reintroducing a non-user submitter type.
    authorKind: text("author_kind").notNull(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(), // 1-5000 chars, app-validated
    // No attachment column in v1 — the kit ships no blob storage. When a
    // fork adds one, this is the extension point: a nullable
    // attachment_asset_key column + a size/type-sniffing upload route.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ix_ticket_messages_ticket_created").on(t.ticketId, t.createdAt),
    check(
      "ticket_messages_author_kind_allowed",
      sql`${t.authorKind} in ('submitter','operator')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// ticket_actions — a generic timeline, not a referentially-precise ledger
// ---------------------------------------------------------------------------

export const ticketActions = pgTable(
  "ticket_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    // Plain labels the calling action already has in hand (e.g. the
    // assignee's display name) — not a second set of nullable FK columns
    // per action kind.
    fromValue: text("from_value"),
    toValue: text("to_value"),
    // The operator who performed the change; null on the 'created' /
    // 'promoted_from_feedback' rows (the actor there is the submitter,
    // already recorded on the ticket row itself).
    actorUserId: uuid("actor_user_id").references(() => users.id),
    // Schema headroom for correlating to audit_events; ships always-null
    // (recordAudit() returns void). The working correlation direction is
    // audit_events.metadata.ticketId, not this column.
    auditEventId: uuid("audit_event_id").references(() => auditEvents.id),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ix_ticket_actions_ticket_applied").on(t.ticketId, t.appliedAt),
    check(
      "ticket_actions_action_allowed",
      sql`${t.action} in ('created','promoted_from_feedback','status_changed','reclassified','area_changed','priority_changed','assigned')`,
    ),
  ],
);
