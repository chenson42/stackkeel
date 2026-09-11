// Moved to packages/auth/src/lockout.ts as of Milestone 1 of the portal
// consolidation (Identity/Permissions Merge) — shared with a predecessor app.
// Re-exported here so every existing "@/lib/auth/lockout" import keeps
// working unchanged. See packages/auth/src/lockout.ts for the
// implementation and full header rationale, and
// docs/work-log/2026-08-27-monorepo-milestone-1-identity.md for the move.
//
// Imports from the "@repo/auth/lockout" subpath, not the barrel — see
// src/lib/two-factor.ts's header for why (the barrel transitively imports
// real next-auth via factory.ts, which crashes Vitest's node environment).
export {
  checkLockout,
  LOCKOUT_THRESHOLD,
  LOCKOUT_DURATION_SECONDS,
  type LockoutState,
} from "@repo/auth/lockout";
