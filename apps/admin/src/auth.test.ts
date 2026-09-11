/**
 * Regression test for the 2026-09-04 urgent security fix
 * (docs/work-log/2026-09-04-totp-per-login-gap.md): Admin's
 * credentials `authorize()` did not require or validate a TOTP code even
 * when the signing-in user had TOTP enrolled — `token.twoFactorVerified`
 * was set to `false` once at login and never read anywhere afterward, so
 * password alone signed an enrolled user in forever. This test drives the
 * REAL `authorize()` function exported from src/auth.ts's Credentials
 * provider (not a reimplemented copy) so that reverting the fix in
 * src/auth.ts makes these tests fail — verified directly for this fix
 * (temporarily reverted, confirmed red; restored, confirmed green) per
 * this session's own discipline for security-relevant bug fixes.
 *
 * MODULE-IMPORT NOTE (mirrors a predecessor app's src/lib/auth.test.ts's own
 * header): importing the real "next-auth" package barrel fails under
 * Vitest (next-auth/lib/env.js pulls in "next/server", which Vitest's
 * Node environment can't resolve). `next-auth/providers/credentials` and
 * `next-auth/providers/google` are unaffected leaf exports (verified) and
 * are used for real, unmocked, below. Only the "next-auth" barrel itself
 * (needed for `CredentialsSignin`) is mocked — and even then, mocked with
 * the REAL `@auth/core/errors` class (not a hand-rolled stand-in), so
 * `instanceof` checks against production's own `CredentialsSignin` stay
 * meaningful. `@auth/core` is pinned to 0.41.3 in this app's own
 * package.json devDependencies specifically for this import, matching the
 * root workspace's `overrides` pin and a predecessor app/package.json's own
 * precedent — see that file's own auth.test.ts header for the full history
 * of the dual-@auth/core-instance bug this identity-matching guards
 * against.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { CredentialsSignin as RealCredentialsSignin } from "@auth/core/errors";

// ---------------------------------------------------------------------------
// Mocks — set up BEFORE importing "@/auth" (vi.mock calls are hoisted by
// Vitest above the imports in this file regardless of source order, but
// written here top-to-bottom for readability).
// ---------------------------------------------------------------------------

vi.mock("next-auth", () => ({
  CredentialsSignin: RealCredentialsSignin,
}));

let capturedCreateAuthOpts: { providers: unknown[] } | undefined;

vi.mock("@repo/auth", async () => {
  // checkLockout/LOCKOUT_THRESHOLD/LOCKOUT_DURATION_SECONDS/
  // normalizeRecoveryCode use the REAL implementation (pure, side-effect-
  // free) rather than a stand-in, so a regression in the actual logic
  // itself would also be caught here — same discipline as
  // CredentialsSignin being the real class below. normalizeRecoveryCode in
  // particular is what makes the shape-sniff dispatch (recovery vs.
  // six-digit TOTP) meaningful to test at all — a stubbed version would
  // just prove the test's own stub, not the real dispatch.
  const actual = await vi.importActual<typeof import("@repo/auth")>(
    "@repo/auth",
  );
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
    decryptSecret: vi.fn((ciphertext: string) => ciphertext),
    verifyToken: vi.fn(),
    checkLockout: actual.checkLockout,
    LOCKOUT_THRESHOLD: actual.LOCKOUT_THRESHOLD,
    LOCKOUT_DURATION_SECONDS: actual.LOCKOUT_DURATION_SECONDS,
    normalizeRecoveryCode: actual.normalizeRecoveryCode,
    // The REAL class, not a stand-in — src/auth.ts does `e instanceof
    // TotpSecretUndecryptableError`, which needs referential identity with
    // whatever throws it. A pre-existing gap in this mock (present before
    // this increment too): nothing in the original suite ever made
    // decryptSecret throw, so the missing export was never reached. This
    // increment's own "never decrypts..." test below is the first to
    // exercise that catch block, and surfaced it — fixed here rather than
    // worked around.
    TotpSecretUndecryptableError: actual.TotpSecretUndecryptableError,
  };
});

// Subpath mock, separate from the barrel above — matches src/auth.ts's own
// import split (see that file's own comment on why verifyRecoveryCode is
// imported via the subpath, not the barrel).
const verifyRecoveryCodeMock = vi.fn();
vi.mock("@repo/auth/verify-recovery-code", () => ({
  verifyRecoveryCode: (...a: unknown[]) => verifyRecoveryCodeMock(...a),
}));

vi.mock("@repo/permissions", () => ({ FEATURES: {} }));

const recordAuditMock = vi.fn();
vi.mock("@/lib/audit", () => ({
  recordAudit: (...a: unknown[]) => recordAuditMock(...a),
  AUDIT_ACTIONS: {
    TOTP_VERIFY_FAILED: "totp.verify_failed",
    TOTP_RECOVERY_SUCCESS: "totp.recovery_succeeded",
    TOTP_RECOVERY_FAILED: "totp.recovery_failed",
  },
}));

const dbMock = {
  query: {
    users: { findFirst: vi.fn() },
    userTotp: { findFirst: vi.fn() },
  },
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  })),
};
vi.mock("@/lib/db", () => ({ db: dbMock }));

const bcryptCompareMock = vi.fn();
vi.mock("bcryptjs", () => ({ default: { compare: bcryptCompareMock } }));

vi.mock("@/lib/request-ip", () => ({ getRequestIp: vi.fn(() => "127.0.0.1") }));

// Typed with checkRateLimit's real parameter shape (matching
// auth.rate-limit-env.test.ts's own precedent) — the Increment 3 tests
// below inspect the KEY each call was made with (to prove the totp:
// bucket is distinct from the signin: bucket) and override the
// implementation per-key, both of which need the real signature, not the
// parameterless inference a bare `vi.fn(async () => ...)` would give.
const checkRateLimitMock = vi.fn(
  async (
    _key: string,
    _limit?: { max: number; windowSeconds: number },
    _context?: { userId?: string | null; actor: string; reason: string },
  ) => ({ allowed: true as boolean }),
);
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));

// ---------------------------------------------------------------------------

type Authorize = (
  credentials: Record<string, unknown>,
  request?: Request,
) => Promise<unknown>;

let authorize: Authorize;

beforeAll(async () => {
  await import("@/auth");
  const providers = capturedCreateAuthOpts?.providers as
    | Array<{ id?: string; options?: { authorize: Authorize } }>
    | undefined;
  const credentialsProvider = providers?.find((p) => p.id === "credentials");
  if (!credentialsProvider?.options?.authorize) {
    throw new Error(
      "Could not locate the real authorize() function via createAuth()'s captured providers — src/auth.ts's provider wiring may have changed shape.",
    );
  }
  authorize = credentialsProvider.options.authorize;
});

const { decryptSecret, verifyToken } = (await import("@repo/auth")) as unknown as {
  decryptSecret: ReturnType<typeof vi.fn>;
  verifyToken: ReturnType<typeof vi.fn>;
};

const activeUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "enrolled@the ancestor site",
  name: "Enrolled User",
  image: null,
  password: "$2b$10$fakehash",
  isActive: true,
  failedLoginAttempts: 0,
  lockedUntil: null as Date | null,
};

function resetMocks() {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue({ allowed: true });
  dbMock.update.mockReturnValue({
    set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  });
  // vi.clearAllMocks() clears call/result history but NOT an implementation
  // installed via .mockImplementation() — restore the default passthrough
  // explicitly, or a later test that never touches decryptSecret at all
  // silently inherits an earlier test's throwing override. Found by
  // running this file: the three new tests below "never decrypts..." all
  // failed with an unrelated-looking TotpSecretUndecryptableError crash
  // until this line was added.
  decryptSecret.mockImplementation((ciphertext: string) => ciphertext);
}

/** A recovery-code-shaped string that survives normalizeRecoveryCode. */
const VALID_SHAPED_RECOVERY_CODE = "ABCD-1234";

describe("apps/admin/src/auth.ts — credentials authorize() TOTP-per-login gate", () => {
  it("requires a TOTP code (throws CredentialsSignin/MFA_REQUIRED) for an enrolled user who submits only a valid password — the exact prior gap", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(true);
    dbMock.query.userTotp.findFirst.mockResolvedValue({
      userId: activeUser.id,
      secretCiphertext: "enc:secret",
    });

    await expect(
      authorize({ email: activeUser.email, password: "correct-password", totpCode: "" }),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });

    // Must be the REAL production CredentialsSignin class, not a lookalike.
    await expect(
      authorize({ email: activeUser.email, password: "correct-password", totpCode: "" }),
    ).rejects.toBeInstanceOf(RealCredentialsSignin);
  });

  it("rejects (returns null) when the submitted TOTP code fails verification for an enrolled user", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(true);
    dbMock.query.userTotp.findFirst.mockResolvedValue({
      userId: activeUser.id,
      secretCiphertext: "enc:secret",
    });
    verifyToken.mockReturnValue(false);

    const result = await authorize({
      email: activeUser.email,
      password: "correct-password",
      totpCode: "000000",
    });

    expect(result).toBeNull();
  });

  it("signs in successfully when the submitted TOTP code verifies for an enrolled user", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(true);
    dbMock.query.userTotp.findFirst.mockResolvedValue({
      userId: activeUser.id,
      secretCiphertext: "enc:secret",
    });
    verifyToken.mockReturnValue(true);

    const result = await authorize({
      email: activeUser.email,
      password: "correct-password",
      totpCode: "123456",
    });

    expect(result).toMatchObject({ id: activeUser.id, email: activeUser.email });
  });

  it("does not require a TOTP code for a user with no TOTP enrollment row (password-only login still works)", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(true);
    dbMock.query.userTotp.findFirst.mockResolvedValue(undefined);

    const result = await authorize({
      email: activeUser.email,
      password: "correct-password",
      totpCode: "",
    });

    expect(result).toMatchObject({ id: activeUser.id, email: activeUser.email });
  });

  it("still rejects on a wrong password before ever reaching the TOTP check", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(false);

    const result = await authorize({
      email: activeUser.email,
      password: "wrong-password",
      totpCode: "",
    });

    expect(result).toBeNull();
    expect(dbMock.query.userTotp.findFirst).not.toHaveBeenCalled();
  });

  it("sanity: decryptSecret/verifyToken glue is exercised (not bypassed) on the enrolled-user path", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(true);
    dbMock.query.userTotp.findFirst.mockResolvedValue({
      userId: activeUser.id,
      secretCiphertext: "enc:secret",
    });
    verifyToken.mockReturnValue(true);

    await authorize({ email: activeUser.email, password: "correct-password", totpCode: "123456" });

    expect(decryptSecret).toHaveBeenCalledWith("enc:secret");
    expect(verifyToken).toHaveBeenCalledWith("123456", "enc:secret");
  });

  // 2026-09-05 ad-hoc security audit finding: this app had NO account-lockout
  // mechanism at all before this fix — only the 5/min rate limit above.
  // These tests drive the same real authorize() function and fail red
  // against the pre-fix code (bcrypt.compare would be called unconditionally
  // regardless of lockedUntil, and no failedLoginAttempts increment ever
  // occurred).
  it("locks out and rejects (without calling bcrypt) once lockedUntil is in the future", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue({
      ...activeUser,
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() + 60_000),
    });

    const result = await authorize({
      email: activeUser.email,
      password: "correct-password",
      totpCode: "",
    });

    expect(result).toBeNull();
    expect(bcryptCompareMock).not.toHaveBeenCalled();
  });

  it("resets the counter (via db.update) once the lock window has expired, then still checks the password", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue({
      ...activeUser,
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() - 60_000),
    });
    bcryptCompareMock.mockResolvedValue(true);
    dbMock.query.userTotp.findFirst.mockResolvedValue(undefined);

    const result = await authorize({
      email: activeUser.email,
      password: "correct-password",
      totpCode: "",
    });

    expect(dbMock.update).toHaveBeenCalled();
    expect(result).toMatchObject({ id: activeUser.id, email: activeUser.email });
  });

  it("increments failedLoginAttempts on a wrong password via db.update", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(false);

    const result = await authorize({
      email: activeUser.email,
      password: "wrong-password",
      totpCode: "",
    });

    expect(result).toBeNull();
    expect(dbMock.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2FA atomic-convergence Increment 3 (2026-09-08 — apps/portal/docs/
// work-log/2026-09-08-2fa-atomic-convergence.md Phase 3 §§ 3.2/3.3;
// root docs/decisions.md DECISION-022 point 4).
//
// Four gaps closed: (1) zero recovery-code branch — a lost authenticator
// meant permanent lockout; (2) zero audit event on a wrong TOTP code;
// (3) no TOTP-specific rate limit, distinct from the password-guess one;
// (4) admin-mediated MFA reset (covered separately, in users/[id]/
// actions.test.ts — not this file, since resetMfaAction lives outside
// authorize()).
// ---------------------------------------------------------------------------
describe("apps/admin/src/auth.ts — 2FA atomic-convergence Increment 3 (recovery code, audit, rate limit)", () => {
  it("accepts a valid recovery code, signs in, and does NOT decrypt the TOTP secret (different stored material)", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(true);
    dbMock.query.userTotp.findFirst.mockResolvedValue({
      userId: activeUser.id,
      secretCiphertext: "enc:secret",
    });
    verifyRecoveryCodeMock.mockResolvedValue({ ok: true, codeId: "code-1" });

    const result = await authorize({
      email: activeUser.email,
      password: "correct-password",
      totpCode: VALID_SHAPED_RECOVERY_CODE,
    });

    expect(result).toMatchObject({ id: activeUser.id, email: activeUser.email });
    expect(verifyRecoveryCodeMock).toHaveBeenCalledWith(
      dbMock,
      activeUser.id,
      VALID_SHAPED_RECOVERY_CODE,
    );
    expect(decryptSecret).not.toHaveBeenCalled();
    expect(verifyToken).not.toHaveBeenCalled();
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "totp.recovery_succeeded" }),
    );
  });

  it("rejects a reused/unknown recovery code (verifyRecoveryCode ok:false), returns null, and audits TOTP_RECOVERY_FAILED", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(true);
    dbMock.query.userTotp.findFirst.mockResolvedValue({
      userId: activeUser.id,
      secretCiphertext: "enc:secret",
    });
    verifyRecoveryCodeMock.mockResolvedValue({ ok: false, reason: "not_found" });

    const result = await authorize({
      email: activeUser.email,
      password: "correct-password",
      totpCode: VALID_SHAPED_RECOVERY_CODE,
    });

    expect(result).toBeNull();
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "totp.recovery_failed" }),
    );
  });

  it("never decrypts the TOTP secret for a recovery-code submission even when the stored secret is undecryptable — the ordering fix (Entry check #2)", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(true);
    dbMock.query.userTotp.findFirst.mockResolvedValue({
      userId: activeUser.id,
      secretCiphertext: "enc:undecryptable",
    });
    // If decryptSecret were called unconditionally before the shape-sniff
    // (the bug this fix corrects), this would throw MFA_UNREADABLE for a
    // VALID recovery code — exactly the scenario recovery codes exist to
    // survive.
    const { TotpSecretUndecryptableError } = await vi.importActual<
      typeof import("@repo/auth")
    >("@repo/auth");
    decryptSecret.mockImplementation(() => {
      throw new TotpSecretUndecryptableError();
    });
    verifyRecoveryCodeMock.mockResolvedValue({ ok: true, codeId: "code-1" });

    const result = await authorize({
      email: activeUser.email,
      password: "correct-password",
      totpCode: VALID_SHAPED_RECOVERY_CODE,
    });

    expect(result).toMatchObject({ id: activeUser.id, email: activeUser.email });
    expect(decryptSecret).not.toHaveBeenCalled();
  });

  it("audits TOTP_VERIFY_FAILED when a submitted 6-digit TOTP code fails verification (previously: nothing was written)", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(true);
    dbMock.query.userTotp.findFirst.mockResolvedValue({
      userId: activeUser.id,
      secretCiphertext: "enc:secret",
    });
    verifyToken.mockReturnValue(false);

    const result = await authorize({
      email: activeUser.email,
      password: "correct-password",
      totpCode: "000000",
    });

    expect(result).toBeNull();
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "totp.verify_failed" }),
    );
  });

  it("does not audit anything on a SUCCESSFUL 6-digit TOTP verification — deliberate omission (§ 3.5), not a gap", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(true);
    dbMock.query.userTotp.findFirst.mockResolvedValue({
      userId: activeUser.id,
      secretCiphertext: "enc:secret",
    });
    verifyToken.mockReturnValue(true);

    await authorize({
      email: activeUser.email,
      password: "correct-password",
      totpCode: "123456",
    });

    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("checks a TOTP-specific rate limit, keyed distinctly from the signin: bucket, before verifying any submitted code", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(true);
    dbMock.query.userTotp.findFirst.mockResolvedValue({
      userId: activeUser.id,
      secretCiphertext: "enc:secret",
    });
    verifyToken.mockReturnValue(true);

    await authorize({
      email: activeUser.email,
      password: "correct-password",
      totpCode: "123456",
    });

    const keys = checkRateLimitMock.mock.calls.map((c) => c[0] as string);
    expect(keys.some((k) => k.startsWith("signin:"))).toBe(true);
    expect(keys.some((k) => k.startsWith("totp:"))).toBe(true);
    expect(new Set(keys).size).toBeGreaterThan(1); // the two keys are distinct
  });

  it("rejects (without calling verifyToken) once the TOTP-specific rate limit is exceeded, independent of the signin limiter", async () => {
    resetMocks();
    dbMock.query.users.findFirst.mockResolvedValue(activeUser);
    bcryptCompareMock.mockResolvedValue(true);
    dbMock.query.userTotp.findFirst.mockResolvedValue({
      userId: activeUser.id,
      secretCiphertext: "enc:secret",
    });
    // signin: bucket still allows (password check already passed); only
    // the totp: bucket is exhausted.
    checkRateLimitMock.mockImplementation(async (key: string) => ({
      allowed: !key.startsWith("totp:"),
    }));

    const result = await authorize({
      email: activeUser.email,
      password: "correct-password",
      totpCode: "123456",
    });

    expect(result).toBeNull();
    expect(verifyToken).not.toHaveBeenCalled();
  });
});
