/**
 * Re-export of the shared contract in packages/ui (promoted 2026-09-05 —
 * Portal and Admin had identical declarations). Kept as a local
 * re-export rather than rewriting every `@/types/actions` import across both
 * apps: the duplication is gone, the call sites are untouched.
 */
export type { ActionResult } from "@repo/ui";
