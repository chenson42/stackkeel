-- MODULE: whats-new
-- VERIFY: SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
-- Admin-published announcements.

CREATE TABLE "whats_new_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "emoji" text,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "published_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id") ON DELETE set null
);
CREATE INDEX "ix_whats_new_published" ON "whats_new_entries" ("published_at" DESC);
