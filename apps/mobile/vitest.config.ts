import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests cover the PURE logic in src/lib (api parsing/dispatch, offline
// queue decisions) with dependencies injected. The two native modules are
// aliased to inert stubs so importing the modules under test never touches
// native code — tests must keep injecting their own storage/fetch/token
// fakes rather than exercising the stubs.
export default defineConfig({
  resolve: {
    alias: {
      "expo-secure-store": path.resolve(__dirname, "src/test-stubs/expo-secure-store.ts"),
      "@react-native-async-storage/async-storage": path.resolve(
        __dirname,
        "src/test-stubs/async-storage.ts",
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
