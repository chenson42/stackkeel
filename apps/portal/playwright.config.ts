/**
 * Playwright config — portal smoke suite.
 *
 * Required env: DATABASE_URL (a disposable database — the global-setup's
 * isolation guard enforces this on shared Neon hosts). Everything else is
 * defaulted below with deterministic e2e-only values so CI can invoke this
 * with nothing but DATABASE_URL + AUTH_SECRET + AUTH_TRUST_HOST
 * (.github/workflows/e2e.yml's contract).
 *
 * Locally: `pnpm --filter portal exec playwright test`. A running `pnpm dev`
 * on :3000 is reused; otherwise one is started.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORTAL_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// Deterministic e2e-only defaults. Real deployments set these for real; the
// values here only ever guard disposable e2e users in a disposable database.
process.env.AUTH_SECRET ??= "e2e-secret-do-not-use-in-prod";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??=
  Buffer.alloc(32, "e2e-totp-key-filler").toString("base64");
process.env.AUTH_URL ??= BASE_URL;
process.env.AUTH_TRUST_HOST ??= "true";
process.env.NEXT_PUBLIC_APP_URL ??= BASE_URL;
// Global-setup signs in repeatedly; the in-memory limiter would trip.
process.env.RATE_LIMIT_DISABLED ??= "true";

export default defineConfig({
  globalSetup: "./e2e/support/global-setup.ts",
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
