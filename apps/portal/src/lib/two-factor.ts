// Moved to packages/auth/src/two-factor.ts as of Milestone 1 of the portal
// consolidation (Identity/Permissions Merge) — shared with a predecessor app.
// Re-exported here so every existing "@/lib/two-factor" import keeps working
// unchanged. See packages/auth/src/two-factor.ts for the implementation and
// docs/work-log/2026-08-27-monorepo-milestone-1-identity.md for the move's
// rationale.
//
// Imports from the "@repo/auth/two-factor" subpath, NOT the package barrel
// ("@repo/auth"), which also re-exports factory.ts's real `import NextAuth
// from "next-auth"`. That import runs next-auth's env-detection code as a
// side effect at module load (imports "next/server"), which Vitest's node
// environment can't resolve — the same class of failure documented in
// src/lib/auth/config.test.ts's next-auth mock. This file (and its sibling
// src/lib/auth/lockout.ts) is a pure crypto/date-math re-export with no
// actual dependency on next-auth, so it uses the narrower subpath to stay
// out of that import graph. See packages/auth/package.json's "exports" map.
export {
  encryptSecret,
  decryptSecret,
  TotpSecretUndecryptableError,
  generateSecret,
  otpauthUrl,
  verifyToken,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  FRESH_RECOVERY_CODES_COOKIE,
} from "@repo/auth/two-factor";
