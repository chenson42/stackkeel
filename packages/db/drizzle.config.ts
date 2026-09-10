import type { Config } from "drizzle-kit";

// For throwaway local prototyping with `drizzle-kit push` ONLY. Committed
// migrations under ./migrations are the source of truth — see README.md.
export default {
  schema: "./src/schema/index.ts",
  out: "./migrations/_scratch",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
