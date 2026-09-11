/**
 * Playwright config — admin smoke suite.
 *
 * Required env: DATABASE_URL (disposable — the global-setup's isolation guard
 * enforces this on shared Neon hosts). Everything else defaults below so CI
 * can invoke with only DATABASE_URL + AUTH_SECRET + AUTH_TRUST_HOST
 * (.github/workflows/e2e.yml's contract).
 *
 * The admin app's atomic authorize() submits credentials twice per
 * TOTP-enrolled login (bare → MFA_REQUIRED → with code), so the sign-in rate
 * limits are elevated for the suite via their documented env overrides.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_ADMIN_PORT ?? 3001);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

process.env.AUTH_SECRET ??= "e2e-secret-do-not-use-in-prod";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??=
  Buffer.alloc(32, "e2e-totp-key-filler").toString("base64");
process.env.AUTH_URL ??= BASE_URL;
process.env.AUTH_TRUST_HOST ??= "true";
process.env.NEXT_PUBLIC_APP_URL ??= BASE_URL;
process.env.RATE_LIMIT_DISABLED ??= "true";
process.env.RATE_LIMIT_LOGIN_MAX ??= "100";
process.env.RATE_LIMIT_MFA_MAX ??= "100";

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
