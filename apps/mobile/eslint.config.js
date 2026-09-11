// Flat ESLint config for the Expo app — eslint-config-expo's flat preset
// plus the workspace's shared ignores.
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/**",
      ".expo/**",
      "ios/**",
      "android/**",
      "node_modules/**",
      "coverage/**",
    ],
  },
]);
