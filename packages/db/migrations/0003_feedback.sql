-- MODULE: feedback
-- VERIFY: SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
-- User feedback (append-only, forward-only status machine) and the per-user
-- daily prompt suppression state.

CREATE TABLE "feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "app" text NOT NULL,
  "category" text,
  "body" text NOT NULL,
  "context_path" text,
  "app_version" text,
  "status" text NOT NULL DEFAULT 'new',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "ix_feedback_status_created" ON "feedback" ("status", "created_at");
CREATE INDEX "ix_feedback_user" ON "feedback" ("user_id");

CREATE TABLE "feedback_prompt_state" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "opted_out" boolean NOT NULL DEFAULT false,
  "last_snoozed_date" text,
  "last_submitted_date" text
);
