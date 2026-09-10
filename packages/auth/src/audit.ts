/**
 * Shared audit-write mechanism. This shares the WRITE PATH, not the
 * storage decisions: actor resolution, request-context capture, and
 * never-throw semantics live here once.
 *
 * DELIBERATELY NOT SHARED — the action vocabulary. Each app's AUDIT_ACTIONS
 * is its own domain language. Forcing one union would either bloat every
 * app with actions it can never emit, or invite a generic catch-all action,
 * which is how audit logs stop being useful. Apps pass their own action
 * strings in.
 *
 * The table is injected rather than imported, for the same reason: this
 * package must not know which app it is running inside.
 */

export interface AuditActorOverride {
  userId: string | null;
  email: string | null;
}

export interface SharedAuditInput {
  /** The app's own action string, from its own AUDIT_ACTIONS catalog. */
  action: string;
  /**
   * Actor resolution:
   *   undefined (omitted) — resolve from the session via `resolveSession`.
   *   { userId, email }   — explicit override (unauthenticated flows, or
   *                         call sites where the session is already loaded).
   *   null                — system write; no actor (bootstrap scripts).
   */
  actor?: AuditActorOverride | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RecordAuditDeps {
  /** Drizzle client for the calling app. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  /** The calling app's own audit_events table object. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auditEvents: any;
  /** Resolves the signed-in actor when `actor` is omitted. */
  resolveSession: () => Promise<{ userId: string | null; email: string | null } | null>;
  /** Reads ip + user-agent from the current request, when there is one. */
  resolveRequestContext: () => Promise<{ ip: string | null; userAgent: string | null }>;
  /** Prefix for the stderr line on failure, e.g. "[audit]". */
  logPrefix: string;
}

/**
 * Writes one audit row. NEVER THROWS — an audit failure must not take down
 * the action that triggered it. Failures go to stderr so they are visible in
 * server logs (console.error is permitted; only console.log is banned in
 * production paths).
 */
export async function recordAuditShared(
  input: SharedAuditInput,
  deps: RecordAuditDeps,
): Promise<void> {
  try {
    let actorUserId: string | null = null;
    let actorEmail: string | null = null;

    if (input.actor === undefined) {
      const session = await deps.resolveSession();
      actorUserId = session?.userId ?? null;
      actorEmail = session?.email ?? null;
    } else if (input.actor !== null) {
      actorUserId = input.actor.userId;
      actorEmail = input.actor.email;
    }
    // else: actor === null → system write; both stay null.

    // Unavailable outside a request context (seed scripts, cron). The insert
    // still runs with nulls rather than being skipped — a row with no ip is
    // more useful than no row.
    const { ip, userAgent } = await deps.resolveRequestContext();

    await deps.db.insert(deps.auditEvents).values({
      actorUserId,
      actorEmail,
      action: input.action,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ?? {},
      ip,
      userAgent,
    });
  } catch (err) {
    console.error(`${deps.logPrefix} failed to write event`, input.action, err);
  }
}
