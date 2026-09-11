import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./identity";

/**
 * Shared platform-service tables. These live in the `public` Postgres schema,
 * NOT in any app's own schema — the same treatment the identity tables get,
 * and for the same reason: no single app owns them. Per-app DOMAIN tables get
 * per-app schemas; genuinely shared tables stay in `public`.
 *
 * IMPORTANT — these must NOT appear in any app's `drizzle.config.ts`
 * `tablesFilter`. A shared table claimed by nobody is correct; claimed by two
 * apps it looks like exactly the collision the cross-app-table-collision
 * tripwire exists to catch.
 */

// ---- Feature flags ----------------------------------------------------
export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  /**
   * Which app this flag applies to: "portal" | "admin", or NULL for a
   * platform-wide flag. Nullable on purpose — it settles the "global vs
   * per-app flags" question without forcing every flag to pick a side.
   * `auth.require_2fa` is genuinely platform-wide (NULL); a portal-only
   * module flag means nothing in the admin app ("portal").
   *
   * `key` stays the primary key rather than (app, key): flag keys are
   * already namespaced (`auth.*`, ...), and a composite PK would let two
   * apps define the same key with different values, which is exactly the
   * ambiguity a flag should not have.
   */
  app: text("app"),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(false),
  rolloutPercent: integer("rollout_percent").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---- Append-only audit log for security-sensitive actions --------------
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Which app wrote the event: "portal" | "admin" | "system". */
    app: text("app").notNull().default("portal"),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ix_audit_actor").on(t.actorUserId),
    index("ix_audit_action_time").on(t.action, t.createdAt),
    index("ix_audit_created").on(t.createdAt),
  ],
);

// ---- Idempotent seed tracking ------------------------------------------
export const migrationSeeds = pgTable("migration_seeds", {
  key: text("key").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---- Email verification tokens (self-serve email address change) -------
// A new token is minted when the user submits a new email; it expires after
// 24 hours. The uniqueIndex on userId enforces one in-flight change per user.
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(), // SHA-256 hex; raw token travels in the email URL
    newEmail: text("new_email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ix_email_ver_token").on(t.token),
    uniqueIndex("ix_email_ver_user").on(t.userId),
  ],
);

// ---- Password reset tokens (self-serve forgot-password) -----------------
// The raw token is emailed; only the SHA-256 hex is stored. The uniqueIndex
// on userId enforces one in-flight reset per user (delete-then-insert).
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ix_pwd_reset_token").on(t.token),
    uniqueIndex("ix_pwd_reset_user").on(t.userId),
  ],
);

// Operator-initiated invites (admin "create user" → set-password email).
// Deliberately a SEPARATE table from password_reset_tokens even though the
// shape matches: the TTLs differ by design (an invite waits days; a
// self-serve reset expires in minutes), and revoking one class must never
// touch the other. userId is UNIQUE — re-inviting overwrites the prior
// token rather than accumulating live links.
export const inviteTokens = pgTable(
  "invite_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ix_invite_token").on(t.token),
    uniqueIndex("ix_invite_user").on(t.userId),
  ],
);

// ---- Durable outbound email queue ------------------------------------
export const emailQueue = pgTable(
  "email_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /**
     * Which app enqueued this message: "portal" | "admin". NOT NULL — every
     * row has an originator. Needed for filtering the queue viewer per app,
     * attributing a permanent failure to the app that has to care about it,
     * and letting a single retry worker serve every app while still
     * reporting per-app.
     */
    app: text("app").notNull().default("portal"),
    /**
     * Optional caller-supplied dedupe key. A retried server action — or a
     * double-submitted form — would otherwise enqueue the same logical email
     * twice. Unique where present; NULL is exempt (Postgres treats NULLs as
     * distinct in a unique index).
     */
    idempotencyKey: text("idempotency_key").unique(),
    // Intended recipient. Always the real address even when EMAIL_DEV_REDIRECT_TO
    // overrides the live send. Stored for monitoring and permanent-fail auditing.
    toEmail: text("to_email").notNull(),
    // Nullable; if null, the send step defaults to RESEND_FROM_EMAIL at send time.
    // Storing it ensures retries use the same from address as the initial attempt.
    fromEmail: text("from_email"),
    replyTo: text("reply_to"),
    subject: text("subject").notNull(),
    // Fully rendered HTML including any token URLs.
    htmlBody: text("html_body").notNull(),
    textBody: text("text_body"),
    // Label for the email type, e.g. 'password_reset' | 'email_change_verify'.
    // Used for monitoring/filtering and permanent-fail audit events.
    // NOT used to re-render at send time.
    templateKey: text("template_key").notNull(),
    // 'queued' | 'processing' | 'sent' | 'failed' — text per schema convention (no pgEnum).
    status: text("status").notNull().default("queued"),
    // Incremented on each attempt (inline or worker). Starts at 0.
    attemptCount: integer("attempt_count").notNull().default(0),
    // Default 8: inline attempt + up to 7 worker retries before permanent failure.
    maxAttempts: integer("max_attempts").notNull().default(8),
    // NULL on insert = eligible for immediate inline attempt.
    // Set to backoff schedule (now + delay) after each failed worker attempt.
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    // Set to NOW() when the worker claims the row. Also used for lease
    // recovery: rows in 'processing' with lastAttemptAt < now() - 10 minutes
    // are considered stuck and re-queued.
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    // Set when status transitions to 'sent'.
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // Provider message ID on successful send; 'dev-intercepted:<uuid>' in dev mode.
    providerMessageId: text("provider_message_id"),
    // Last error message from the provider on failure. Overwritten each attempt.
    // Also set on bounce events from the provider webhook.
    failureReason: text("failure_reason"),
    // Delivery-event timestamps from the provider webhook. All nullable:
    // NULL = event not yet received or webhook not configured.
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    complainedAt: timestamp("complained_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Primary worker query filter: WHERE status='queued' AND nextAttemptAt <= now()
    index("ix_email_queue_status_next").on(t.status, t.nextAttemptAt),
    // Lease-recovery query: WHERE status='processing' AND lastAttemptAt < now()-10min
    index("ix_email_queue_status_last").on(t.status, t.lastAttemptAt),
    // Webhook UPDATE path: WHERE provider_message_id = $1 (one lookup per event).
    index("ix_email_queue_provider_message_id").on(t.providerMessageId),
  ],
);

// ---- User feedback ---------------------------------------------------
// Append-only; status progresses forward only:
//   new → triaged → done (delivered)
//   new/triaged → declined
// Terminal states never regress — enforced by validateFeedbackTransition.
// FK to users only — no joins to roles, sessions, or any other table
// (privacy invariant: admin triage shows display name only, never email).
// SECURITY: feedback bodies are untrusted user text and must be treated as
// prompt-injection vectors — session tooling may COUNT rows, never read them.
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Which app the submission came from: "portal" | "admin". */
    app: text("app").notNull(),
    // 'suggestion' | 'bug' | 'other' | null (user didn't choose).
    category: text("category"),
    // User-supplied text. Trimmed; length enforced server-side (1–2000 chars).
    body: text("body").notNull(),
    // Bug-only metadata. Null when category !== 'bug'.
    contextPath: text("context_path"),
    appVersion: text("app_version"),
    // 'new' | 'triaged' | 'done' | 'declined' — text, not pgEnum.
    status: text("status").notNull().default("new"),
    // kit-module:helpdesk-begin
    // Set when an operator promotes this row into a helpdesk ticket
    // (module `helpdesk`; column added by 0006_helpdesk.sql). Plain uuid,
    // not a Drizzle FK — support.ts already imports platform.ts, and a
    // references() here would close that loop into a circular module
    // dependency. The real FK constraint lives in the migration.
    promotedToTicketId: uuid("promoted_to_ticket_id"),
    // kit-module:helpdesk-end
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ix_feedback_status_created").on(t.status, t.createdAt),
    index("ix_feedback_user").on(t.userId),
  ],
);

// Per-user daily prompt suppression state. One row per user (userId is PK).
//
// CLOBBER-PREVENTION INVARIANT: each upsert operation (submit, snooze,
// opt-out) sets ONLY its own column in onConflictDoUpdate.set. The other two
// columns retain their existing values. Never touch more than one field per
// upsert.
export const feedbackPromptState = pgTable("feedback_prompt_state", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // true = user permanently dismissed the daily prompt.
  optedOut: boolean("opted_out").notNull().default(false),
  // 'YYYY-MM-DD' — last date the user clicked "Not today".
  lastSnoozedDate: text("last_snoozed_date"),
  // 'YYYY-MM-DD' — last date the user submitted feedback.
  lastSubmittedDate: text("last_submitted_date"),
});

// ---- What's new -------------------------------------------------------
// Admin-published announcements shown to members. Body is plain text only;
// validated server-side (HTML rejected, not stripped). publishedAt is set on
// INSERT only; UPDATE actions must never touch this column so that edits
// don't resurface old entries as "new" in the list ordering.
export const whatsNewEntries = pgTable(
  "whats_new_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Optional; ≤2 Unicode code points validated server-side.
    emoji: text("emoji"),
    title: text("title").notNull(), // ≤100 chars, plain text
    body: text("body").notNull(), // ≤500 chars, plain text
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(), // INSERT only; UPDATE actions MUST NOT include this column
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("ix_whats_new_published").on(t.publishedAt.desc())],
);
