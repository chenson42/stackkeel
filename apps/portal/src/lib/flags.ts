import { cache } from "react";
import { isFlagEnabledFor } from "@repo/db";
import { db } from "@/lib/db";

/**
 * Portal's flag reader. The lookup itself moved to packages/db
 * (isFlagEnabledFor) 2026-09-05 so a predecessor app and the platform Admin can read flags
 * too; this wrapper pins the calling app and keeps the React cache().
 *
 * Scoping now matters: a flag row with app='portal' answers here, a row with
 * app=NULL is platform-wide and also answers here, and a row scoped to
 * another app returns false. See packages/db/src/flags.ts.
 *
 * Deduplicated via React cache() — within a single RSC render pass (e.g.
 * layout + page both calling isFlagEnabled("tasks.module")), one SELECT fires.
 *
 * NOT deduplicated in:
 *   - Server actions: each invocation is a separate execution context;
 *     cache() is a no-op. Call it as-is — the per-call SELECT is the cost.
 *   - NextAuth callbacks (authorize, jwt): same reason. Intentional and safe;
 *     the auth-mode flags read isFlagEnabled inside jwt() and the wrap has no
 *     effect there.
 *
 * The cache() wrap stays app-local rather than moving into packages/db: that
 * package also runs inside scripts and cron, where React cache() is
 * meaningless.
 */
export const isFlagEnabled = cache(
  async (key: string): Promise<boolean> => isFlagEnabledFor(db, key, "portal"),
);
