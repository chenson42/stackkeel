/**
 * rate-limit.ts — Two-tier rate limiter for authentication-adjacent endpoints.
 *
 * TIERS
 * -----
 * 1. In-memory (always-on): A module-level Map with lazy eviction. Resets on
 *    cold start — this is a known limitation on Vercel serverless. An in-memory
 *    limiter is NOT effective against distributed attacks or a patient attacker
 *    who can trigger cold starts. It is the zero-config baseline for forks.
 *    Recommended for development only. See docs/decisions.md for details.
 *
 * 2. Upstash Redis (optional): Activates automatically when both
 *    UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are present in env.
 *    Uses the SlidingWindow algorithm from @upstash/ratelimit. This is the
 *    recommended backend for any production deployment.
 *
 * AUDIT
 * -----
 * checkRateLimit writes a RATE_LIMIT_BLOCKED audit row on every blocked call.
 * This write comes from inside this lib file, not from any actions.ts file.
 * The check:audit script scans only src/app/** /actions.ts — it will not see
 * this write. That is CORRECT. Do not add an audit-exempt annotation to the
 * calling actions.ts files.
 *
 * UPSTASH IMPORT STRATEGY
 * -------------------------
 * All call sites (Credentials authorize, server actions) run in the Node
 * runtime, not on the Edge. A top-level import guarded by an env-var check at
 * module init is safe and simpler than a dynamic import.
 */

import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { getRequestIp } from "@/lib/request-ip";

// IP extraction is provided by @/lib/request-ip (DECISION-017).
// Import getRequestIp from @/lib/request-ip — do not import from this module.

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

const MAX_MAP_SIZE = 10_000;

interface InMemoryWindow {
  count: number;
  windowStart: number; // Date.now() ms
}

/** Module-level singleton — resets on cold start (expected, documented). */
const inMemoryStore = new Map<string, InMemoryWindow>();

/**
 * Check against the in-memory fixed-window store.
 * Lazy eviction: expired windows are deleted and restarted on access.
 * FIFO overflow: when the map exceeds MAX_MAP_SIZE, the oldest entry
 * (first insertion order key) is dropped to admit the new one.
 */
function inMemoryCheck(
  key: string,
  max: number,
  windowSeconds: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const existing = inMemoryStore.get(key);

  if (existing && now < existing.windowStart + windowMs) {
    // Within the current window.
    existing.count += 1;
    if (existing.count > max) {
      const retryAfterMs = existing.windowStart + windowMs - now;
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  // Window expired (or no entry). Start a fresh window.
  // FIFO eviction when at capacity.
  if (!existing && inMemoryStore.size >= MAX_MAP_SIZE) {
    const oldestKey = inMemoryStore.keys().next().value;
    if (oldestKey !== undefined) inMemoryStore.delete(oldestKey);
  } else if (existing) {
    // Just delete the stale entry; size won't grow.
    inMemoryStore.delete(key);
  }

  inMemoryStore.set(key, { count: 1, windowStart: now });
  return { allowed: true, retryAfterSeconds: 0 };
}

// ---------------------------------------------------------------------------
// Upstash implementation
// ---------------------------------------------------------------------------

const useUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

// Named limiter cache: keyed by "${max}:${windowSeconds}" to avoid creating a
// new Ratelimit instance on every call for the same parameters.
let upstashLimiters: Map<string, any> | null = null;
let UpstashRatelimit: any = null;
let UpstashRedis: any = null;

if (useUpstash) {
  // These imports are safe — all call sites are Node runtime, not Edge.
  UpstashRatelimit = require("@upstash/ratelimit").Ratelimit;
  UpstashRedis = require("@upstash/redis").Redis;
  upstashLimiters = new Map();
}

let _upstashRedis: unknown = null;
function getUpstashRedis() {
  if (!_upstashRedis) {
    _upstashRedis = new UpstashRedis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _upstashRedis;
}

function getUpstashLimiter(max: number, windowSeconds: number): any {
  const cacheKey = `${max}:${windowSeconds}`;
  if (!upstashLimiters!.has(cacheKey)) {
    upstashLimiters!.set(
      cacheKey,
      new UpstashRatelimit({
        redis: getUpstashRedis(),
        limiter: UpstashRatelimit.slidingWindow(max, `${windowSeconds} s`),
        prefix: "@ratelimit",
      }),
    );
  }
  return upstashLimiters!.get(cacheKey);
}

async function upstashCheck(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const limiter = getUpstashLimiter(max, windowSeconds);
  const res = await limiter.limit(key);
  if (res.success) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const retryAfterMs = res.reset - Date.now();
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the caller is within their rate-limit window.
 *
 * @param key       - Namespaced identifier, e.g. "signin:1.2.3.4:user@example.com"
 * @param limit     - { max: number; windowSeconds: number }
 * @param context   - Written into the audit row when allowed === false:
 *                    { userId?: string | null; actor: string; reason: string }
 *
 * Returns { allowed: true } or { allowed: false; retryAfterSeconds: number }.
 * Writes RATE_LIMIT_BLOCKED to audit_events on every blocked call.
 *
 * NOTE: The check:audit script scans only src/app/** /actions.ts. This module
 * writes audit rows from inside a lib file — the script will not see them.
 * That is correct; do not add audit-exempt annotations to actions.ts callers.
 */
export async function checkRateLimit(
  key: string,
  limit: { max: number; windowSeconds: number },
  context: { userId?: string | null; actor: string; reason: string },
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  // Escape hatch for local development and e2e test runs. The in-memory store
  // accumulates state across the dev server's lifetime — running a Playwright
  // suite multiple times will exhaust the per-IP+email signin budget. Set
  // `RATE_LIMIT_DISABLED=true` in `.env.local` to short-circuit. NEVER set in
  // production. Unit tests are unaffected (they call internal helpers).
  if (process.env.RATE_LIMIT_DISABLED === "true") {
    return { allowed: true };
  }

  const result = useUpstash
    ? await upstashCheck(key, limit.max, limit.windowSeconds)
    : inMemoryCheck(key, limit.max, limit.windowSeconds);

  if (!result.allowed) {
    // Fire-and-forget — don't let an audit write failure block the response.
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
