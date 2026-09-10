// Shared ESLint building blocks for every app and package in the workspace.
// Each app's own eslint.config.mjs spreads `baseIgnores` in and adds whatever
// app-specific ignores it needs; the eslint-config-next wiring stays app-owned.
export const baseIgnores = [
  ".next/**",
  "out/**",
  "build/**",
  "dist/**",
  "coverage/**",
  "next-env.d.ts",
];

// Locale-dependent formatting must go through the shared date/number helpers,
// never ad-hoc toLocale* calls — output differs between server and browser
// locales and breaks React hydration. Spread into each app's `rules`.
export const noToLocaleRules = {
  "no-restricted-syntax": [
    "error",
    {
      selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]",
      message: "Use the shared date/number formatting helpers instead of toLocale* (hydration-unsafe).",
    },
  ],
};
