/**
 * global-setup — portal e2e.
 *
 * 1. DB isolation guard (refuses shared Neon hosts in CI without explicit
 *    acknowledgment).
 * 2. Runs the bootstrap + e2e seeds (`db:seed`, `db:seed:e2e`) so the suite is
 *    self-provisioning — the e2e workflow only migrates and bootstrap-seeds.
 * 3. Acquires a member storageState via the NextAuth credentials API
 *    (CSRF → callback POST → session verify). NextAuth 5 answers the callback
 *    with HTTP 302 always — do not check `.ok()`.
 *
 * Delete e2e/support/.auth/ after changing any SEED_* env var: fresh files
 * (<12h) skip re-acquisition, so a stale storageState would be reused.
 */
import { chromium, type FullConfig } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.resolve(__dirname, ".auth");
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export const MEMBER_EMAIL =
  process.env.SEED_MEMBER_EMAIL ?? "e2e-member@example.com";
export const MEMBER_PASSWORD =
  process.env.SEED_MEMBER_PASSWORD ?? "e2e-member-password-1";

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

export async function acquireStorageState(
  config: FullConfig,
  email: string,
  password: string,
  filePath: string,
  extraForm: Record<string, string> = {},
): Promise<void> {
  const baseURL =
    (config.projects[0].use.baseURL as string) ?? "http://localhost:3000";
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
    // NextAuth 5 always 302s here; the session cookie rides the redirect.
    const callbackRes = await context.request.post(
      `${baseURL}/api/auth/callback/credentials`,
      {
        form: { csrfToken, email, password, callbackUrl: `${baseURL}/launch`, ...extraForm },
        maxRedirects: 0,
      },
    );
    if (callbackRes.status() >= 400) {
      throw new Error(
        `[globalSetup] credentials POST returned HTTP ${callbackRes.status()} for ${email}`,
      );
    }
    const sessionRes = await context.request.get(`${baseURL}/api/auth/session`);
    const session = (await sessionRes.json()) as { user?: { email?: string } };
    if (session?.user?.email !== email) {
      throw new Error(
        `[globalSetup] no session for ${email} after sign-in (got: ${JSON.stringify(session)})`,
      );
    }
    await context.storageState({ path: filePath });
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  runDbIsolationGuard();

  execSync("pnpm --filter @repo/db db:seed && pnpm --filter @repo/db db:seed:e2e", {
    cwd: path.resolve(__dirname, "../.."),
    stdio: "inherit",
    env: process.env,
  });

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const memberState = path.join(AUTH_DIR, "member.json");
  if (!isFresh(memberState)) {
    await acquireStorageState(config, MEMBER_EMAIL, MEMBER_PASSWORD, memberState);
    console.log(`[globalSetup] member storageState saved`);
  }
}
