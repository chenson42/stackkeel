-- MODULE: helpdesk
-- Support tickets: tickets, threaded messages, a generic action timeline,
-- and the feedback → ticket promotion column. Strippable at personalization
-- (delete this file + packages/db/src/schema/support.ts + the app surfaces).
-- VERIFY: SELECT 1 FROM information_schema.tables WHERE table_name = 'feedback'

CREATE TABLE IF NOT EXISTS "tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "submitter_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "subject" text NOT NULL,
  "change_class" text NOT NULL,
  "area" text NOT NULL,
  "priority" text NOT NULL DEFAULT 'normal',
  "status" text NOT NULL DEFAULT 'new',
  "assignee_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tickets_change_class_allowed"
    CHECK ("change_class" in ('content','config','theme','bug','feature')),
  CONSTRAINT "tickets_area_allowed"
    CHECK ("area" in ('account','billing','content','website','other')),
  CONSTRAINT "tickets_priority_allowed"
    CHECK ("priority" in ('low','normal','high','urgent')),
  CONSTRAINT "tickets_status_allowed"
    CHECK ("status" in ('new','triaged','in_progress','resolved','declined'))
);
CREATE INDEX "ix_tickets_submitter_created" ON "tickets" ("submitter_user_id", "created_at");
CREATE INDEX "ix_tickets_status_created" ON "tickets" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "ticket_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id" uuid NOT NULL REFERENCES "tickets"("id") ON DELETE CASCADE,
  "author_kind" text NOT NULL,
  "author_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ticket_messages_author_kind_allowed"
    CHECK ("author_kind" in ('submitter','operator'))
);
CREATE INDEX "ix_ticket_messages_ticket_created" ON "ticket_messages" ("ticket_id", "created_at");

CREATE TABLE IF NOT EXISTS "ticket_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id" uuid NOT NULL REFERENCES "tickets"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "from_value" text,
  "to_value" text,
  "actor_user_id" uuid REFERENCES "users"("id"),
  "audit_event_id" uuid REFERENCES "audit_events"("id"),
  "applied_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ticket_actions_action_allowed"
    CHECK ("action" in ('created','promoted_from_feedback','status_changed','reclassified','area_changed','priority_changed','assigned'))
);
CREATE INDEX "ix_ticket_actions_ticket_applied" ON "ticket_actions" ("ticket_id", "applied_at");

-- Feedback promotion pointer. ON DELETE SET NULL: deleting a ticket must
-- never delete (or block deletion because of) the feedback row it came from.
ALTER TABLE "feedback"
  ADD COLUMN IF NOT EXISTS "promoted_to_ticket_id" uuid
  REFERENCES "tickets"("id") ON DELETE SET NULL;
