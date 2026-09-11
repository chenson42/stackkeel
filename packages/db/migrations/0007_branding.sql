-- MODULE: core
-- Runtime brand state (single-row) + append-only history, and the
-- ui.brand_theming flag (seeded OFF — the static Starter palette renders
-- until an operator both saves a brand and turns the flag on).
-- VERIFY: SELECT 1 FROM information_schema.tables WHERE table_name = 'feature_flags'

CREATE TABLE IF NOT EXISTS "branding" (
  "id" text PRIMARY KEY DEFAULT 'default',
  "seed_hex" text NOT NULL,
  "type_pairing" text NOT NULL DEFAULT 'classic',
  "light_only" boolean NOT NULL DEFAULT false,
  "brand_token_version" integer NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "branding_single_row" CHECK ("id" = 'default'),
  CONSTRAINT "branding_seed_hex_format" CHECK ("seed_hex" ~ '^#[0-9a-f]{6}$')
);

CREATE TABLE IF NOT EXISTS "branding_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "seed_hex" text NOT NULL,
  "type_pairing" text NOT NULL,
  "light_only" boolean NOT NULL,
  "brand_token_version" integer NOT NULL,
  "changed_at" timestamptz NOT NULL DEFAULT now(),
  "changed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);

INSERT INTO "feature_flags" ("key", "app", "description", "enabled")
VALUES (
  'ui.brand_theming',
  NULL,
  'Emit runtime brand tokens from the branding row (overrides the static Starter palette).',
  false
)
ON CONFLICT ("key") DO NOTHING;
