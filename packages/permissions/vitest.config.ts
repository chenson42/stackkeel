import { defineConfig } from "vitest/config";

// packages/permissions had no test runner at all before Phase 5 QA of
// 2026-09-04-cross-app-switcher — this config exists to run index.test.ts,
// specifically the hasRoleInApp() fail-closed pinning test (DECISION-059
// ruling 3 / Edge Cases: "a role name that doesn't literally appear in
// APP_ROLE_NAMESPACES[app] never satisfies this for ANY app"). Prior to this,
// that behavior was only exercised indirectly via each app's own
// app-switcher.test.ts against the getAppSwitcherTiles() wrapper, never
// directly against the shared source of truth. Mirrors packages/auth's
// vitest.config.ts shape (node environment; everything under src/ is pure).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
