-- MODULE: core
-- Operator-initiated invite tokens (admin "create user" flow). Separate
-- from password_reset_tokens by design: different TTL semantics, and
-- revocation of one class must never touch the other.
-- VERIFY: SELECT 1 FROM information_schema.tables WHERE table_name = 'users'

CREATE TABLE IF NOT EXISTS "invite_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ix_invite_token" ON "invite_tokens" ("token");
CREATE UNIQUE INDEX IF NOT EXISTS "ix_invite_user" ON "invite_tokens" ("user_id");
