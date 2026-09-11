import { defineConfig } from "vitest/config";

/**
 * First test config this package has ever needed (added 2026-09-06,
 * Increment 5 of the cross-app feedback umbrella — MyFeedbackList is the
 * first component in packages/ui to get its own unit test). `environment:
 * "jsdom"` globally, unlike apps/portal's node-default-plus-per-file-
 * annotation split: every exported member of this package is a React
 * component or a pure type, never a server-only/node-only module, so there
 * is no "pure function" test class here that would want the cheaper node
 * environment.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
