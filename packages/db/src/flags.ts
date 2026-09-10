import { asc, eq } from "drizzle-orm";
import { featureFlags } from "./schema/platform";

/**
 * Shared feature-flag reader.
 *
 * SCOPING. `feature_flags.app` is nullable:
 *   NULL          → platform-wide; applies to every app.
 *   "portal" etc. → applies to that app only.
 *
 * So a flag is on for a caller when the row exists, is enabled, AND is either
 * unscoped or scoped to that caller. A portal-only module flag means nothing
 * in the admin app, so admin asking for it gets `false` — which is the whole
 * point of the column. `auth.require_2fa` is unscoped and answers the same
 * for everyone.
 *
 * FAILS CLOSED on an unknown key. A missing row returns false — the safer
 * default: a typo'd flag name silently disables a feature rather than
 * silently enabling one.
 *
 * `db` is injected rather than imported so this module stays app-agnostic,
 * the same shape as queueEmail() and recordAuditShared(). React `cache()`
 * deliberately does NOT wrap this: caching is a per-app, per-render-tree
 * concern and belongs in each app's own thin wrapper, not in a db package
 * that also runs inside scripts and cron jobs.
 */
export type FlagApp = "portal" | "admin";

export async function isFlagEnabledFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  key: string,
  app: FlagApp,
): Promise<boolean> {
  const row = await db.query.featureFlags.findFirst({
    where: eq(featureFlags.key, key),
  });

  if (!row) return false;

  // `?? null` deliberately, not `!== null`: a row can arrive with `app`
  // UNDEFINED rather than null — from a partial column select, or an older
  // row read before the column existed. Treating undefined as "scoped to
  // some other app" would silently disable every such flag. Both undefined
  // and null mean unscoped.
  const scope = row.app ?? null;
  if (scope !== null && scope !== app) return false;

  return row.enabled === true;
}

/** One row as returned by `listFlags()`/`setFlag()` — pinned to the table's
 * own inferred select type, matching the same discipline `EmailQueueRow`
 * follows in ./email-queue.ts. */
export type FeatureFlagRow = typeof featureFlags.$inferSelect;

/**
 * Read every flag row — the admin viewer/editor's list query
 * (2026-09-05-admin-menu-structure). No pagination: this is a small,
 * operator-maintained table (a handful of named flags), not
 * high-volume data like the email queue.
 */
export async function listFlags(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<FeatureFlagRow[]> {
  return db.select().from(featureFlags).orderBy(asc(featureFlags.key));
}

export interface SetFlagInput {
  /** null/undefined = platform-wide. A specific app id scopes the flag to it. */
  app?: string | null;
  enabled: boolean;
  description?: string;
  rolloutPercent?: number;
}

export interface SetFlagResult {
  /** The row as it existed before this write, or null if this created it. */
  before: FeatureFlagRow | null;
  after: FeatureFlagRow;
}

/**
 * Upsert one flag row (2026-09-05-admin-menu-structure). This is the FIRST
 * write path to a table that already gates live auth behavior
 * platform-wide (`auth.require_2fa`) — see that design doc's own Edge Cases
 * section. Callers are responsible for their own auth gate and audit write;
 * this function only performs the database operation and hands back the
 * before/after rows so the caller doesn't need a separate read to build an
 * audit event's metadata.
 *
 * `key` stays the primary key (see schema/platform.ts's own header) —
 * upsert targets it via `onConflictDoUpdate`, which also means calling this
 * with a brand-new key CREATES the flag row rather than erroring.
 *
 * Omitted `app`/`description`/`rolloutPercent` preserve the existing row's
 * value on an update, and default to unscoped/null/0 on a fresh insert — an
 * operator toggling `enabled` on an existing flag doesn't have to resupply
 * its scope or description every time. `app` is checked against `undefined`
 * specifically (not `??`) so that passing `app: null` explicitly still
 * works to intentionally rescope a flag to platform-wide.
 */
export async function setFlag(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  key: string,
  input: SetFlagInput,
): Promise<SetFlagResult> {
  const before: FeatureFlagRow | null =
    (await db.query.featureFlags.findFirst({ where: eq(featureFlags.key, key) })) ?? null;

  const values = {
    key,
    app: input.app !== undefined ? input.app : (before?.app ?? null),
    description: input.description ?? before?.description ?? null,
    enabled: input.enabled,
    rolloutPercent: input.rolloutPercent ?? before?.rolloutPercent ?? 0,
    updatedAt: new Date(),
  };

  const [after] = await db
    .insert(featureFlags)
    .values(values)
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: {
        app: values.app,
        description: values.description,
        enabled: values.enabled,
        rolloutPercent: values.rolloutPercent,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  return { before, after };
}
