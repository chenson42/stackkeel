import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Cross-app audit reader (2026-09-05,
 * apps/portal/docs/work-log/2026-09-05-shared-platform-services.md).
 *
 * Three apps write audit rows to three per-app tables; only Portal had a
 * viewer, so a predecessor app's and Admin's trails were written and never
 * readable by anyone. This reads all three.
 *
 * It lives in Admin because that is the app that already spans all
 * three, and "who did what across our systems" is an administrator's
 * question rather than a Portal user's.
 *
 * WHY RAW SQL RATHER THAN DRIZZLE: the three tables live in three different
 * Postgres schemas and are owned by three different apps. Declaring the other
 * apps' tables in this app's schema module would make drizzle-kit believe
 * this app owns them — which is exactly the cross-app collision
 * scripts/check-cross-app-table-collision.mjs exists to prevent. A read-only
 * UNION does not need ownership.
 *
 * The tables are column-for-column identical by design (that was the point of
 * giving a predecessor app a new table rather than adapting its legacy one), so the
 * UNION needs no per-app shimming.
 */
export interface CrossAppAuditRow {
  app: string;
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Physical audit sources. The kit writes EVERY app's events to the one
 * shared public.audit_events table with an `app` column (the row's own
 * writer stamps it) — so there is exactly one source, and the app filter
 * is a column predicate, not a UNION branch. A fork that gives an app its
 * own per-schema audit_events adds a second entry here; the degenerate
 * union machinery below already handles N sources and a missing schema.
 */
const SOURCES: Array<{ app: string; table: string }> = [
  { app: "platform", table: "public.audit_events" },
];

/**
 * Which sources actually exist on THIS database.
 *
 * Not defensive programming for its own sake: staging has no `admin` schema
 * at all (Admin has never been migrated there), and a UNION naming a
 * missing relation fails the whole query — so the viewer would show nothing
 * anywhere rather than degrading to the apps that do exist. `to_regclass`
 * returns NULL instead of raising for an unknown relation.
 */
async function availableSources(): Promise<typeof SOURCES> {
  // Each check MUST be aliased, and the result MUST be read back by that
  // alias. An unaliased `to_regclass(x) IS NOT NULL` is named `?column?` by
  // Postgres, so three of them are three columns with the SAME name;
  // node-postgres builds one object per row keyed by column name, and the
  // duplicates collapse into a single key. `Object.values(row)` then returns
  // one boolean instead of three, and every source after the first reads as
  // missing.
  //
  // That is not a hypothetical: it shipped. On a database where all three
  // tables exist with rows, this function reported sources ['a predecessor app's] and
  // missing ['portal', 'admin'], and the UI stated as fact that two apps had
  // never been migrated here. A wrong answer presented confidently, which is
  // worse than the query failing. Caught by Phase 5 running it against real
  // Postgres; it survived both the implementation and an architectural
  // review because neither executed the query.
  const checks = SOURCES.map(
    (s, i) => sql`to_regclass(${s.table}) IS NOT NULL AS ${sql.raw(`src_${i}`)}`,
  );
  const res = await db.execute(sql`SELECT ${sql.join(checks, sql`, `)}`);
  const row = res.rows[0] as Record<string, boolean> | undefined;
  if (!row) return [];
  return SOURCES.filter((_, i) => row[`src_${i}`] === true);
}

export interface CrossAppAuditQuery {
  /** Restrict to one app; omit for all. */
  app?: string;
  /** Case-insensitive PREFIX match on `action`. Prefix rather than contains
   *  because action names are hierarchical (`admin.role.granted`), so
   *  a prefix selects a whole family of events, which is the useful shape. */
  actionPrefix?: string;
  /** Case-insensitive CONTAINS match on `actor_email`. */
  actorEmail?: string;
  /** Case-insensitive CONTAINS match on either `resource_type` or
   *  `resource_id` — an administrator looking for "this person" has an id or
   *  an email, not a column name. */
  resource?: string;
  /** ISO date (YYYY-MM-DD). Events on or after this date. */
  since?: string;
  /** ISO date (YYYY-MM-DD). Events up to and including the WHOLE of this day
   *  — see toExclusiveEnd() for why that matters. */
  until?: string;
  limit?: number;
  offset?: number;
}

/** Exported for tests. A valid YYYY-MM-DD, or undefined. Anything else is IGNORED rather than
 *  raising: a half-typed date in a filter box must not blank the page. */
export function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** `until` is inclusive of the whole day given, so it becomes an exclusive
 *  bound at the start of the NEXT day.
 *
 *  The naive reading (`created_at < until`) makes the most obvious query a
 *  user can type -- the same date in both boxes, meaning "show me that day"
 *  -- return zero rows. That looks like "nothing happened", which for an
 *  audit log is the single most dangerous wrong answer it can give. */
export function toExclusiveEnd(d: Date): Date {
  return new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

export async function readCrossAppAudit(
  query: CrossAppAuditQuery = {},
): Promise<{ rows: CrossAppAuditRow[]; sources: string[]; missing: string[] }> {
  const available = await availableSources();
  const missing = SOURCES.filter((s) => !available.includes(s)).map((s) => s.app);

  // The kit's app dimension is a COLUMN on the shared table, so query.app
  // filters rows (below), never sources.
  const wanted = available;
  if (wanted.length === 0) {
    return { rows: [], sources: available.map((s) => s.app), missing };
  }

  const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
  const offset = Math.max(query.offset ?? 0, 0);

  // Each branch is a fixed, code-controlled table address from SOURCES —
  // never user input — so sql.raw() here cannot carry an injection. The
  // user-supplied parts (actionPrefix, limit, offset) stay parameterised.
  const branches = wanted.map(
    (s) => sql`
      SELECT app, id::text AS id, actor_user_id::text AS actor_user_id,
             actor_email, action, resource_type, resource_id, ip, user_agent, metadata, created_at
      FROM ${sql.raw(s.table)}
    `,
  );

  const unioned = sql.join(branches, sql` UNION ALL `);

  // Every filter below is PARAMETERISED. The only sql.raw() in this module is
  // the fixed, code-controlled table address in the branches above; nothing
  // user-supplied is ever interpolated. Keep it that way.
  //
  // Filtering happens HERE, in the query -- never in the page over the
  // returned rows. Client-side filtering would narrow the 200-row recency
  // WINDOW rather than the data, so searching for an event that really exists
  // would return nothing and read as "it never happened". For an audit log
  // that is the worst available failure mode.
  const conditions = [];
  if (query.app) {
    conditions.push(sql`app = ${query.app}`);
  }
  if (query.actionPrefix) {
    conditions.push(sql`action ILIKE ${query.actionPrefix + "%"}`);
  }
  if (query.actorEmail) {
    conditions.push(sql`actor_email ILIKE ${"%" + query.actorEmail + "%"}`);
  }
  if (query.resource) {
    const needle = "%" + query.resource + "%";
    conditions.push(
      sql`(resource_type ILIKE ${needle} OR resource_id ILIKE ${needle})`,
    );
  }
  const since = parseDate(query.since);
  if (since) conditions.push(sql`created_at >= ${since}`);
  const until = parseDate(query.until);
  if (until) conditions.push(sql`created_at < ${toExclusiveEnd(until)}`);

  const whereClause =
    conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

  const res = await db.execute(sql`
    WITH combined AS (${unioned})
    SELECT * FROM combined
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const rows = (res.rows as Record<string, unknown>[]).map((r) => ({
    app: String(r.app),
    id: String(r.id),
    actorUserId: (r.actor_user_id as string | null) ?? null,
    actorEmail: (r.actor_email as string | null) ?? null,
    action: String(r.action),
    resourceType: (r.resource_type as string | null) ?? null,
    resourceId: (r.resource_id as string | null) ?? null,
    ip: (r.ip as string | null) ?? null,
    userAgent: (r.user_agent as string | null) ?? null,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: new Date(r.created_at as string),
  }));

  return { rows, sources: available.map((s) => s.app), missing };
}
