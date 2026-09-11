/**
 * docs/work-log/2026-09-05-e2e-fixture-determinism.md — proves the signin
 * rate limit's {max, windowSeconds} really is read from
 * RATE_LIMIT_LOGIN_MAX / RATE_LIMIT_LOGIN_WINDOW_SECONDS at import time (the
 * env-gated elevation Fix 2 adds), not just that those two names appear
 * somewhere in src/auth.ts.
 *
 * Separate file from auth.test.ts on purpose: env vars have to be set
 * BEFORE "@/auth" is first imported (the module-scope consts read
 * process.env exactly once, at import time), and each test below needs a
 * DIFFERENT env state, so this file uses `vi.resetModules()` + a fresh
 * dynamic import per case rather than sharing auth.test.ts's single
 * top-level `beforeAll` import.
 *
 * This is the honest substitute for a live demonstration of Fix 2 against a
 * real dev server: today's actual e2e verification ran against the platform
 * Admin's already-running interactive dev server on port 3002, whose
 * RATE_LIMIT_DISABLED was baked in as `true` at that process's own startup
 * (predating this fix) and does not hot-reload from .env.local edits
 * (confirmed empirically — see this work-log's Phase 1/5 notes) — so that
 * live run could not exercise the elevated-limit code path at all, only the
 * fixture-reset fix. This test exercises the real, unmocked wiring from env
 * var to the exact `{max, windowSeconds}` object handed to checkRateLimit,
 * independent of any running server.
 */
import { describe, it, expect, vi } from "vitest";
import { CredentialsSignin as RealCredentialsSignin } from "@auth/core/errors";

vi.mock("next-auth", () => ({ CredentialsSignin: RealCredentialsSignin }));

let capturedCreateAuthOpts: { providers: unknown[] } | undefined;

vi.mock("@repo/auth", async () => {
  const actualLockout = await vi.importActual<typeof import("@repo/auth")>("@repo/auth");
  return {
    createAuth: vi.fn((opts: { providers: unknown[] }) => {
      capturedCreateAuthOpts = opts;
      return {
        handlers: {},
        auth: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
        unstable_update: vi.fn(),
      };
    }),
    computeSharedJwtClaims: vi.fn(),
    decryptSecret: vi.fn((c: string) => c),
    verifyToken: vi.fn(),
    checkLockout: actualLockout.checkLockout,
    LOCKOUT_THRESHOLD: actualLockout.LOCKOUT_THRESHOLD,
    LOCKOUT_DURATION_SECONDS: actualLockout.LOCKOUT_DURATION_SECONDS,
  };
});

vi.mock("@repo/permissions", () => ({ FEATURES: {} }));

// 2FA atomic-convergence Increment 3 (2026-09-08) — src/auth.ts now imports
// both of these; unmocked, `@/lib/audit`'s own `import "server-only"`
// throws under Vitest's Node environment ("This module cannot be imported
// from a Client Component module"), which is exactly what broke this file
// the first time this increment's src/auth.ts change ran against it (found
// by running the full suite, not assumed).
vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn(),
  AUDIT_ACTIONS: {
    TOTP_VERIFY_FAILED: "totp.verify_failed",
    TOTP_RECOVERY_SUCCESS: "totp.recovery_succeeded",
    TOTP_RECOVERY_FAILED: "totp.recovery_failed",
  },
}));
vi.mock("@repo/auth/verify-recovery-code", () => ({ verifyRecoveryCode: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: { findFirst: vi.fn(async () => undefined) },
      userTotp: { findFirst: vi.fn() },
    },
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  },
}));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));
vi.mock("@/lib/request-ip", () => ({ getRequestIp: vi.fn(() => "127.0.0.1") }));

// Typed with checkRateLimit's real parameter shape (not the parameterless
// inference vi.fn(async () => ...) would give) so .mock.calls[n] carries
// the {max, windowSeconds} argument's real type below.
const checkRateLimitMock = vi.fn(
  async (
    _key: string,
    _limit: { max: number; windowSeconds: number },
    _context: { userId: string | null; actor: string; reason: string },
  ) => ({ allowed: true as const }),
);
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));

type Authorize = (credentials: Record<string, unknown>, request?: Request) => Promise<unknown>;

async function loadAuthorizeWithEnv(env: Record<string, string | undefined>): Promise<Authorize> {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await import("@/auth");
  const opts = capturedCreateAuthOpts as { providers: unknown[] } | undefined;
  const providers = opts?.providers as
    | Array<{ id?: string; options?: { authorize: Authorize } }>
    | undefined;
  const credentialsProvider = providers?.find((p) => p.id === "credentials");
  if (!credentialsProvider?.options?.authorize) {
    throw new Error(
      "Could not locate the real authorize() function via createAuth()'s captured providers — src/auth.ts's provider wiring may have changed shape.",
    );
  }
  return credentialsProvider.options.authorize;
}

describe("apps/admin/src/auth.ts — RATE_LIMIT_LOGIN_MAX / RATE_LIMIT_LOGIN_WINDOW_SECONDS env-gating", () => {
  it("defaults to the unchanged production values (max: 5, windowSeconds: 60) when unset", async () => {
    const authorize = await loadAuthorizeWithEnv({
      RATE_LIMIT_LOGIN_MAX: undefined,
      RATE_LIMIT_LOGIN_WINDOW_SECONDS: undefined,
    });
    checkRateLimitMock.mockClear();

    await authorize({ email: "someone@platform.invalid", password: "whatever" });

    expect(checkRateLimitMock).toHaveBeenCalledTimes(1);
    const [, limit] = checkRateLimitMock.mock.calls[0]!;
    expect(limit).toEqual({ max: 5, windowSeconds: 60 });
  });

  it("reads an env override — the e2e elevation path this fix adds", async () => {
    const authorize = await loadAuthorizeWithEnv({
      RATE_LIMIT_LOGIN_MAX: "1234",
      RATE_LIMIT_LOGIN_WINDOW_SECONDS: "77",
    });
    checkRateLimitMock.mockClear();

    await authorize({ email: "someone@platform.invalid", password: "whatever" });

    expect(checkRateLimitMock).toHaveBeenCalledTimes(1);
    const [, limit] = checkRateLimitMock.mock.calls[0]!;
    expect(limit).toEqual({ max: 1234, windowSeconds: 77 });
  });
});
