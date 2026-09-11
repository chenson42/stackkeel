/**
 * global-setup — admin e2e.
 *
 * Seeds (bootstrap + e2e users), then acquires an admin storageState through
 * the app's ATOMIC authorize(): email + password + a fresh otplib TOTP code in
 * ONE credentials callback POST (apps/admin/src/auth.ts). NextAuth 5 answers
 * the callback with HTTP 302 always — do not check `.ok()`.
 *
 * Delete e2e/support/.auth/ after changing SEED_* env vars — fresh files
 * (<12h) skip re-acquisition.
 */
import { chromium, type FullConfig } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
// otplib v13: functional API (generateSync), no `authenticator` namespace.
import { generateSync } from "otplib";

const AUTH_DIR = path.resolve(__dirname, ".auth");
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "e2e-admin@example.com";
export const ADMIN_PASSWORD =
  process.env.SEED_ADMIN_PASSWORD ?? "e2e-admin-password-1";
export const ADMIN_TOTP_SECRET =
  process.env.SEED_ADMIN_TOTP_SECRET ?? "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
export const FRESH_ADMIN_EMAIL =
  process.env.SEED_MFA_ADMIN_EMAIL ?? "e2e-admin-fresh@example.com";
export const FRESH_ADMIN_PASSWORD =
  process.env.SEED_MFA_ADMIN_PASSWORD ?? "e2e-admin-fresh-password-1";
export const MEMBER_EMAIL =
  process.env.SEED_MEMBER_EMAIL ?? "e2e-member@example.com";

function isFresh(filePath: string): boolean {
  try {
    return Date.now() - fs.statSync(filePath).mtimeMs < TWELVE_HOURS_MS;
  } catch {
    return false;
  }
}

function runDbIsolationGuard(): void {
  if (process.env.E2E_DATABASE_URL) return;
  let hostname: string;
  try {
    hostname = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return;
  }
  if (!hostname.endsWith(".neon.tech")) return;
  const msg =
    "[globalSetup] DATABASE_URL points at a Neon database. E2e runs write test " +
    "users and rows. Use an ephemeral branch (CI does), set E2E_DATABASE_URL to a " +
    "dedicated branch, or set E2E_ALLOW_SHARED_DB=true to acknowledge the risk.";
  if (process.env.E2E_ALLOW_SHARED_DB === "true") return;
  if (process.env.CI) throw new Error(msg);
  console.warn(`\n${msg}\n`);
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  runDbIsolationGuard();

  execSync("pnpm --filter @repo/db db:seed && pnpm --filter @repo/db db:seed:e2e", {
    cwd: path.resolve(__dirname, "../.."),
    stdio: "inherit",
    env: process.env,
  });

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const adminState = path.join(AUTH_DIR, "admin.json");
  if (isFresh(adminState)) return;

  const baseURL =
    (config.projects[0].use.baseURL as string) ?? "http://localhost:3001";
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const csrfRes = await context.request.get(`${baseURL}/api/auth/csrf`);
    if (!csrfRes.ok()) {
      throw new Error(
        `[globalSetup] CSRF fetch failed (HTTP ${csrfRes.status()}) — is the server up on ${baseURL}?`,
      );
    }
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const callbackRes = await context.request.post(
      `${baseURL}/api/auth/callback/credentials`,
      {
        form: {
          csrfToken,
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          totpCode: generateSync({ secret: ADMIN_TOTP_SECRET }),
          callbackUrl: `${baseURL}/users`,
        },
        maxRedirects: 0,
      },
    );
    if (callbackRes.status() >= 400) {
      throw new Error(
        `[globalSetup] credentials POST returned HTTP ${callbackRes.status()} for ${ADMIN_EMAIL}`,
      );
    }
    const sessionRes = await context.request.get(`${baseURL}/api/auth/session`);
    const session = (await sessionRes.json()) as { user?: { email?: string } };
    if (session?.user?.email !== ADMIN_EMAIL) {
      throw new Error(
        `[globalSetup] no admin session after sign-in (got: ${JSON.stringify(session)})`,
      );
    }
    await context.storageState({ path: adminState });
    console.log("[globalSetup] admin storageState saved");
  } finally {
    await browser.close();
  }
}
