/**
 * Canonical server-action return type, shared by Portal and the admin app.
 *
 * Promoted 2026-09-05 — both apps declared this identically, and Admin's own
 * copy said so in a comment ("identical contract to apps/portal/src/types/
 * actions.ts"), which is the shape duplication takes right before it drifts.
 *
 * a predecessor app deliberately has no equivalent and is NOT a missing consumer: it
 * exposes REST route handlers returning NextResponse.json(), not `"use
 * server"` actions, so this contract has nothing to describe there.
 *
 * Type-only, so importing it from a server file costs nothing at runtime —
 * the import is erased at compile time and pulls in none of this package's
 * client components.
 */
export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };
