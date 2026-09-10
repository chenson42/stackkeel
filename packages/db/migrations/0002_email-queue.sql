-- MODULE: email-queue
-- Durable outbound email queue with exponential-backoff retry, lease
-- recovery, and provider delivery-event columns.

CREATE TABLE "email_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app" text NOT NULL DEFAULT 'portal',
  "idempotency_key" text,
  "to_email" text NOT NULL,
  "from_email" text,
  "reply_to" text,
  "subject" text NOT NULL,
  "html_body" text NOT NULL,
  "text_body" text,
  "template_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 8,
  "next_attempt_at" timestamptz,
  "last_attempt_at" timestamptz,
  "sent_at" timestamptz,
  "provider_message_id" text,
  "failure_reason" text,
  "delivered_at" timestamptz,
  "opened_at" timestamptz,
  "clicked_at" timestamptz,
  "bounced_at" timestamptz,
  "complained_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "email_queue_idempotency_key_unique" UNIQUE ("idempotency_key")
);
CREATE INDEX "ix_email_queue_status_next" ON "email_queue" ("status", "next_attempt_at");
CREATE INDEX "ix_email_queue_status_last" ON "email_queue" ("status", "last_attempt_at");
CREATE INDEX "ix_email_queue_provider_message_id" ON "email_queue" ("provider_message_id");
