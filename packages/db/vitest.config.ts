import { defineConfig } from "vitest/config";

// packages/db is pure Node — no DOM, no Next.js runtime. Tests for
// flags.ts/email-queue.ts run as integration tests against the real local
// Postgres database (see src/test/db.ts) rather than mocks, per the
// "no self-agreeing DB mocks" rule: a mock that echoes the implementation's
// own column names would pass even when a column name is wrong.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests share one physical database and mutate rows
    // (feature_flags is keyed by a small, human-curated set of `key`
    // values) — run test FILES serially so two files can't race on the
    // same key. Individual `it()`s within a file may still run concurrently
    // unless marked otherwise; every test here uses a unique/randomized key
    // per test as a second layer of isolation.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/schema/**", "src/test/**"],
    },
  },
});
