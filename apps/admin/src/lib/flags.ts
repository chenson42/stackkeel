import { cache } from "react";
import { isFlagEnabledFor } from "@repo/db";
import { db } from "@/lib/db";

/**
 * Admin's feature-flag reader.
 *
 * NEW 2026-09-05 — this app had no flag capability at all before the shared
 * `feature_flags` table moved into packages/db. Flags were Portal-only, so
 * anything environment-toggleable here had to be an env var or a code change.
 *
 * Scoping: a row with `app = 'admin'` answers here; a row with `app = NULL`
 * is platform-wide and also answers here; a row scoped to another app returns
 * false. Unknown keys fail closed. See packages/db/src/flags.ts.
 *
 * NOTHING READS THIS YET, deliberately. Wiring a flag into an existing gate
 * (for example `auth.require_2fa`, which is platform-wide and would now be
 * readable here) changes live auth behaviour, and that belongs in its own
 * reviewed change rather than riding along with the capability that makes it
 * possible.
 */
export const isFlagEnabled = cache(
  async (key: string): Promise<boolean> => isFlagEnabledFor(db, key, "admin"),
);
