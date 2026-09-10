-- MODULE: two-factor
-- VERIFY: SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
-- TOTP enrollment, pending enrollments, and recovery codes. Secrets are
-- AES-256-GCM encrypted at rest (packages/auth/src/two-factor.ts) under
-- AUTH_TOTP_ENCRYPTION_KEY — rotating that key invalidates every row here.

CREATE TABLE "user_totp" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "secret_ciphertext" text NOT NULL,
  "enrolled_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz
);

CREATE TABLE "user_totp_pending_enrollments" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "secret_ciphertext" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "user_totp_recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "code_hash" text NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "ix_recovery_user" ON "user_totp_recovery_codes" ("user_id");
