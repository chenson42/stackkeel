import { defineConfig } from "vitest/config";

// Node environment: everything under src/ is pure/server-only, no React
// components in this package.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
