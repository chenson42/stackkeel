import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Default Vitest config — mirrors the sibling apps' configs and
 * apps/portal/vitest.config.ts's own shape byte-for-byte (this app had no
 * vitest.config.ts at all before the 2026-09-04 urgent TOTP-per-login fix,
 * docs/work-log/2026-09-04-totp-per-login-gap.md; its one prior spec,
 * src/lib/app-switcher.test.ts, only used relative imports so the missing
 * "@/" alias never surfaced). Added because auth.test.ts needs `@/auth`,
 * `@/lib/db`, etc. to resolve.
 *
 * `environment: "node"` is correct for everything under `src/lib/` (pure
 * functions, crypto, server-only helpers) and for `src/auth.ts`. When
 * adding tests for React components, either flip this to "jsdom" globally
 * or use an inline `// @vitest-environment jsdom` annotation.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // `next/navigation` lives under node_modules, so Vitest externalizes it
    // by default. vi.mock("next/navigation", ...) is only guaranteed to
    // intercept a module reliably when Vitest owns its transform/module
    // graph — for an externalized module, interception depends on winning a
    // race against Node's own module cache, shared across test files reusing
    // the same forked worker process. Ported verbatim from
    // a predecessor app's vitest config, which diagnosed this exact race
    // (~11% of full-suite runs) 2026-09-04
    // (docs/work-log/2026-09-04-role-taxonomy-reconciliation.md, Phase 5 QA
    // loop-back) once more than one spec file mocked this module. Added here
    // 2026-09-08 (2026-09-08-2fa-atomic-convergence.md, Increment 0) ahead
    // of this app's own first `vi.mock("next/navigation", ...)` spec, so the
    // new regression test doesn't have to discover the race live.
    server: {
      deps: {
        inline: ["next/navigation"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Explicit include, matching apps/portal's own
      // vitest.config.ts — without it, v8 only instruments files actually
      // imported by a test, so an untested file is simply ABSENT from the
      // report instead of showing 0%. Found by the 2026-09-05 test-coverage
      // review: with no include, the coverage summary listed only 7 files
      // total (the ones already under test) while 17+ real files — every
      // mutation actions.ts among them — were invisible rather than
      // reported as gaps. See docs/reviews/2026-09-05-test-coverage.md.
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
  },
});
