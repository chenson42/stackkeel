// Flat ESLint config for apps/admin. Mirrors
// apps/portal/eslint.config.mjs exactly — Next.js's bundled flat config
// (next, react, react-hooks, typescript, jsx-a11y, import) plus the
// project-wide ignores/rules shared across this monorepo's apps.
import nextConfig from "eslint-config-next";
import { baseIgnores } from "@repo/config/eslint-base.mjs";

const config = [
  ...nextConfig,
  {
    // baseIgnores is the subset shared with the sibling apps — see
    // packages/config/eslint-base.mjs.
    ignores: [
      ...baseIgnores,
      "dist/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "drizzle/**",
    ],
  },
  // Ban toLocale* everywhere — same invariant as apps/portal (timezone-safe
  // date rendering). If/when this app gains its own (or a promoted
  // packages/ui) <FormattedDate> primitive, exempt that one file the same
  // way apps/portal/eslint.config.mjs exempts its own.
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^toLocale(String|DateString|TimeString)$/]",
          message:
            "Use a timezone-safe <FormattedDate>-style component instead of toLocale*() to avoid SSR timezone mismatches (see apps/portal/src/components/shared/formatted-date.tsx for the pattern).",
        },
      ],
    },
  },
  // Exempt the primitive itself — it is the one place toLocale* is
  // intentional (ux-developer's Phase 4 pass, ported from apps/portal's
  // own formatted-date.tsx, same exemption shape).
  {
    files: ["src/components/shared/formatted-date.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
];

export default config;
