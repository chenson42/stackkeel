-- MODULE: core
-- Identity (users/roles/features), auth adapter tables, feature flags,
-- audit log, seed tracking, and self-serve token tables.

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text,
  "email" text NOT NULL,
  "email_verified" timestamptz,
  "image" text,
  "password" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_login_at" timestamptz,
  "failed_login_attempts" integer NOT NULL DEFAULT 0,
  "locked_until" timestamptz,
  "two_factor_required" boolean NOT NULL DEFAULT true,
  "must_change_password" boolean NOT NULL DEFAULT false,
  "account_status" text NOT NULL DEFAULT 'active',
  "roles_version" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "users_email_unique" UNIQUE ("email")
);

CREATE TABLE "accounts" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "provider" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "refresh_token" text,
  "access_token" text,
  "expires_at" integer,
  "token_type" text,
  "scope" text,
  "id_token" text,
  "session_state" text,
  CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY ("provider", "provider_account_id")
);

CREATE TABLE "sessions" (
  "session_token" text PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "expires" timestamptz NOT NULL
);

CREATE TABLE "verification_tokens" (
  "identifier" text NOT NULL,
  "token" text NOT NULL,
  "expires" timestamptz NOT NULL,
  CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY ("identifier", "token")
);

CREATE TABLE "roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "display_name" text NOT NULL,
  "description" text,
  "is_system" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "roles_name_unique" UNIQUE ("name")
);

CREATE TABLE "user_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE cascade,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "ix_user_roles_user_role" ON "user_roles" ("user_id", "role_id");

CREATE TABLE "features" (
  "key" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "category" text NOT NULL
);

CREATE TABLE "role_features" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE cascade,
  "feature_key" text NOT NULL REFERENCES "features"("key") ON DELETE cascade
);
CREATE UNIQUE INDEX "ix_role_features_role_feature" ON "role_features" ("role_id", "feature_key");

-- Session-freshness trigger: any grant/revoke bumps the affected user's
-- roles_version so packages/auth's computeSharedJwtClaims re-derives
-- roles/features on that user's very next request (revocation freshness).
CREATE OR REPLACE FUNCTION bump_roles_version() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    UPDATE users SET roles_version = roles_version + 1 WHERE id = OLD.user_id;
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    UPDATE users SET roles_version = roles_version + 1
      WHERE id IN (OLD.user_id, NEW.user_id);
    RETURN NEW;
  ELSE
    UPDATE users SET roles_version = roles_version + 1 WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_roles_bump_version
AFTER INSERT OR UPDATE OR DELETE ON "user_roles"
FOR EACH ROW EXECUTE FUNCTION bump_roles_version();

CREATE TABLE "feature_flags" (
  "key" text PRIMARY KEY NOT NULL,
  "app" text,
  "description" text,
  "enabled" boolean NOT NULL DEFAULT false,
  "rollout_percent" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app" text NOT NULL DEFAULT 'portal',
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "actor_email" text,
  "action" text NOT NULL,
  "resource_type" text,
  "resource_id" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ip" text,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "ix_audit_actor" ON "audit_events" ("actor_user_id");
CREATE INDEX "ix_audit_action_time" ON "audit_events" ("action", "created_at");
CREATE INDEX "ix_audit_created" ON "audit_events" ("created_at");

CREATE TABLE "migration_seeds" (
  "key" text PRIMARY KEY NOT NULL,
  "applied_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "email_verification_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token" text NOT NULL,
  "new_email" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "ix_email_ver_token" ON "email_verification_tokens" ("token");
CREATE UNIQUE INDEX "ix_email_ver_user" ON "email_verification_tokens" ("user_id");

CREATE TABLE "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "ix_pwd_reset_token" ON "password_reset_tokens" ("token");
CREATE UNIQUE INDEX "ix_pwd_reset_user" ON "password_reset_tokens" ("user_id");
