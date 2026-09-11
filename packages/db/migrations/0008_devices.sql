-- MODULE: mobile
-- Device auth for the native clients (Capacitor shell + Expo app): device
-- bearer tokens (hashed at rest), single-use pairing codes, and the
-- app-release version-gate policy. Strippable at personalization (delete
-- this file + packages/db/src/schema/devices.ts + packages/db/src/devices.ts
-- + apps/shell + apps/mobile + the portal bridge/API surfaces).
-- VERIFY: SELECT 1 FROM information_schema.tables WHERE table_name = 'users'

CREATE TABLE IF NOT EXISTS "devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text,
  "platform" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "app_version" text,
  "push_token" text,
  "last_seen_at" timestamptz,
  "revoked_at" timestamptz,
  "revoked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "devices_platform_allowed" CHECK ("platform" in ('ios','android'))
);
CREATE INDEX "ix_devices_user_created" ON "devices" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "device_pairing_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "ix_device_pairing_codes_user" ON "device_pairing_codes" ("user_id");

CREATE TABLE IF NOT EXISTS "app_release_policy" (
  "id" text PRIMARY KEY DEFAULT 'default',
  "min_build" integer,
  "latest_build" integer,
  "soft_message" text,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "app_release_policy_single_row" CHECK ("id" = 'default')
);

-- Version-gate UI flag. Fail-open: while off, AppVersionGate renders nothing.
-- Device REGISTRATION is deliberately not flag-gated (the Expo app must work
-- out of the box); this only turns the update nudge/block UI on.
INSERT INTO "feature_flags" ("key", "app", "description", "enabled")
VALUES (
  'mobile.update_check',
  NULL,
  'Show the native-app update banner / hard block driven by app_release_policy.',
  false
)
ON CONFLICT ("key") DO NOTHING;
