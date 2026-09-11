/**
 * rate-limit.ts — in-memory rate limiter for this app's auth-adjacent
 * endpoints (credentials sign-in, invite-token consumption).
 *
 * DELIBERATE SCOPE REDUCTION vs. apps/portal/src/lib/rate-limit.ts: Portal's
 * version has a second, optional Upstash Redis tier that activates when
 * UPSTASH_REDIS_REST_URL/TOKEN are set. This app's package.json already
 * carries @upstash/ratelimit + @upstash/redis (Phase 2/DECISION-054
 * approved the dependency set) but this pass does NOT wire them up — Phase
 * 2 ruled "no crons needed for v1" and this app has no production traffic
 * yet; an in-memory limiter is the same zero-config baseline both other
 * apps ship with. Wiring the Upstash tier is a named, reasonable Phase 4
 * follow-up once this app has real deployed traffic — flagged for
 * apps/admin/docs/TODO.md once that scaffolding exists (see this file's
 * handoff note in the work-log).
 *
 * Same algorithm and audit contract as apps/portal/src/lib/rate-limit.ts's
 * in-memory tier: fixed window, lazy eviction, FIFO overflow at
 * MAX_MAP_SIZE. Writes RATE_LIMIT_BLOCKED to this app's own audit_events on
 * every blocked call (fire-and-forget).
 */

import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";
import { AUDIT_ACTIONS } from "@/lib/audit";

const MAX_MAP_SIZE = 10_000;

interface InMemoryWindow {
  count: number;
  windowStart: number;
}

const inMemoryStore = new Map<string, InMemoryWindow>();

function inMemoryCheck(
  key: string,
  max: number,
  windowSeconds: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const existing = inMemoryStore.get(key);

  if (existing && now < existing.windowStart + windowMs) {
    existing.count += 1;
    if (existing.count > max) {
      const retryAfterMs = existing.windowStart + windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (!existing && inMemoryStore.size >= MAX_MAP_SIZE) {
    const oldestKey = inMemoryStore.keys().next().value;
    if (oldestKey !== undefined) inMemoryStore.delete(oldestKey);
  } else if (existing) {
    inMemoryStore.delete(key);
  }

  inMemoryStore.set(key, { count: 1, windowStart: now });
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Check whether the caller is within their rate-limit window.
 *
 * @param key     - Namespaced identifier, e.g. "signin:1.2.3.4:user@x.org"
 * @param limit   - { max: number; windowSeconds: number }
 * @param context - Written into the audit row when allowed === false.
 */
export async function checkRateLimit(
  key: string,
  limit: { max: number; windowSeconds: number },
  context: { userId?: string | null; actor: string; reason: string },
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  // Same escape hatch as apps/portal/src/lib/rate-limit.ts — never set in
  // production, exists so a local Playwright suite doesn't exhaust the
  // per-IP+email signin budget across repeated runs.
  if (process.env.RATE_LIMIT_DISABLED === "true") {
    return { allowed: true };
  }

  const result = inMemoryCheck(key, limit.max, limit.windowSeconds);

  if (!result.allowed) {
    db.insert(auditEvents)
      .values({
        actorUserId: context.userId ?? null,
        actorEmail: context.actor.includes("@") ? context.actor : null,
        action: AUDIT_ACTIONS.RATE_LIMIT_BLOCKED,
        resourceType: "rate_limit",
        resourceId: key,
        metadata: {
          reason: context.reason,
          actor: context.actor,
          retryAfterSeconds: result.retryAfterSeconds,
        },
      })
      .catch(() => {
        // Swallow — audit write failure must not block the caller.
      });

    return { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
  }

  return { allowed: true };
}

// Exported for unit tests only.
export { inMemoryStore as _inMemoryStore };
