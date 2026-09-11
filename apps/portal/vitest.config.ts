import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Default Vitest config.
 *
 * `environment: "node"` is correct for everything under `src/lib/` (pure
 * functions, crypto, server-only helpers). When you add tests for React
 * components, either flip this to "jsdom" globally or use an inline
 * `// @vitest-environment jsdom` annotation at the top of those specs.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "scripts/**/*.test.mjs",
      // task-auth-onto-roles (DECISION-017), Increment 2, 2026-09-08. Every
      // existing scripts/*.test.mjs file tests a plain Node script with no
      // TypeScript imports or path aliases. scripts/backfill-staff-2026-09-08.ts
      // is the first script that needs vi.mock() against "@/..." aliased,
      // TypeScript project modules (it imports applyPersonaRole from
      // src/lib/tasks/persona.ts) — .mjs can't express that, so this glob
      // is added rather than renamed/replaced.
      "scripts/**/*.test.ts",
    ],
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
    },
  },
});
