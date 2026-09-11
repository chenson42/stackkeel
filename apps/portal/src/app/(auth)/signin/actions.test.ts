/**
 * Regression test for Increment 0 of the atomic 2FA convergence
 * (docs/work-log/2026-09-08-2fa-atomic-convergence.md, Phase 1 Adversarial
 * Pass finding 1 / Claims Ledger row 4): the pre-split `signInWithCredentials`
 * took a caller-supplied `callbackUrl` and passed it straight into
 * `resolvePostSignInDestination()` and then `redirect()`, without
 * re-sanitizing. This Server Action is directly invocable with an arbitrary
 * payload by anyone who can reach its action reference — not only through
 * the rendered form — so `src/app/(auth)/signin/page.tsx`'s own
 * `sanitizeCallbackUrl()` call on the GET-render path does not protect this
 * one. Fixed by re-sanitizing at the actual enforcement site.
 *
 * Drives the REAL `signInWithCredentialsLegacy` (not a reimplemented
 * predicate), so reverting the fix in `src/app/(auth)/signin/actions.ts`
 * makes this file fail — confirmed live this session (see the work-log's
 * Increment 0 section for the literal before/after output).
 *
 * Unlike a predecessor app/Admin, Portal's `resolvePostSignInDestination`
 * (src/lib/auth/two-factor-gate.ts) is scoped to `/admin/*` only — a
 * non-`/admin` callbackUrl (the common case, and every malicious external
 * URL used below: `new URL(raw, "http://placeholder").pathname` never
 * starts with "/admin" for these payloads) returns `callbackUrl` verbatim
 * with NO gate in front of it at all, which is the exact bare-`return
 * callbackUrl` branch this hardening protects.
 *
 * 2026-09-08 atomic-2FA convergence, Increment 1 (client half) — EXTENDED,
 * not just repointed. `signInWithCredentials` was renamed to
 * `signInWithCredentialsLegacy` verbatim (Phase 4 server half's own naming
 * split); the "Increment 0" describe block below drives that renamed
 * function with zero logic changes, so it keeps proving exactly the
 * property it always proved. A second describe block was ADDED, driving
 * the new `signInWithCredentialsAtomic` — same callbackUrl-hardening
 * property against the atomic path, plus the MFA_REQUIRED/MFA_UNREADABLE/
 * wrong-code signal contract that action owns (Phase 4 server half's own
 * "The contract ux-developer consumes" table).
 *
 * MODULE-IMPORT NOTE: importing the real "next-auth" package barrel fails
 * under Vitest (next-auth/lib/env.js pulls in "next/server"). The "next-auth"
 * barrel is mocked with stub `AuthError`/`CredentialsSignin` classes rather
 * than the REAL `@auth/core/errors` classes Admin's/a predecessor app's own equivalent
 * tests use (`apps/admin/src/app/signin/actions.test.ts`,
 * `a predecessor app's src/app/(auth)/login/actions.test.ts`) — Portal has no
 * `@auth/core` devDependency of its own (only `@auth/drizzle-adapter`,
 * whose nested copy isn't resolvable from this app's top-level node_modules
 * under pnpm's strict linking). The stub `CredentialsSignin` below extends
 * the stub `AuthError`, matching the real class hierarchy closely enough
 * for `instanceof` checks against either to behave correctly in this file's
 * own scenarios.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.mock() calls are hoisted above imports by Vitest's transform.
// ---------------------------------------------------------------------------

vi.mock("next-auth", () => {
  class AuthError extends Error {}
  class CredentialsSignin extends AuthError {
    code = "CredentialsSignin";
  }
  return { AuthError, CredentialsSignin };
});

// redirect() throws in real Next.js — mocked the same shape every other
// actions.test.ts in this app uses.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const mockSignIn = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ signIn: mockSignIn }));

const mockUsersFindFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: { findFirst: mockUsersFindFirst },
      userTotp: { findFirst: vi.fn(async () => null) },
    },
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: { email: "email" },
  userTotp: { userId: "userId" },
}));

// Effective-2FA computation is exercised by its own unit tests
// (src/lib/auth/local-login.test.ts) — stubbed here to a fixed, non-gating
// value so the LEGACY describe block below stays focused on the
// callbackUrl property, not on re-proving 2FA-effectiveness logic.
const mockComputeEffectiveTwoFactor = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/local-login", () => ({
  computeEffectiveTwoFactor: mockComputeEffectiveTwoFactor,
}));

// The second-factor predicate has its own dedicated unit tests
// (second-factor-policy.test.ts) — stubbed here so the ATOMIC describe
// block below stays focused on this action's own callbackUrl-hardening and
// error-signal properties, not on re-proving the predicate itself.
const mockComputeSecondFactorPolicy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/second-factor-policy", () => ({
  computeSecondFactorPolicy: mockComputeSecondFactorPolicy,
}));

import { redirect } from "next/navigation";
import { CredentialsSignin } from "next-auth";
import {
  signInWithCredentialsLegacy,
  signInWithCredentialsAtomic,
} from "./actions";

const mockedRedirect = vi.mocked(redirect);

function primeLegacyUser() {
  mockSignIn.mockResolvedValue(undefined);
  mockUsersFindFirst.mockResolvedValue({ twoFactorRequired: false });
  mockComputeEffectiveTwoFactor.mockResolvedValue(false);
}

describe("signInWithCredentialsLegacy — Increment 0 callbackUrl hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeLegacyUser();
  });

  it("rejects an absolute external callbackUrl and falls back to the app default, not the attacker's host", async () => {
    await expect(
      signInWithCredentialsLegacy({
        email: "member@the ancestor site",
        password: "correct-password",
        callbackUrl: "https://evil.example/phish",
      }),
    ).rejects.toThrow(/^REDIRECT:/);

    expect(mockedRedirect).toHaveBeenCalledTimes(1);
    const destination = mockedRedirect.mock.calls[0][0] as string;
    expect(destination).not.toContain("evil.example");
    expect(destination).toBe("/home"); // Portal's own fallback, apps/portal/src/lib/auth/safe-callback.ts
  });

  it("rejects a protocol-relative callbackUrl (//evil.example) and falls back to the app default", async () => {
    await expect(
      signInWithCredentialsLegacy({
        email: "member@the ancestor site",
        password: "correct-password",
        callbackUrl: "//evil.example",
      }),
    ).rejects.toThrow(/^REDIRECT:/);

    const destination = mockedRedirect.mock.calls[0][0] as string;
    expect(destination).not.toContain("evil.example");
    expect(destination).toBe("/home");
  });

  it("passes through a legitimate same-origin relative callbackUrl unchanged", async () => {
    await expect(
      signInWithCredentialsLegacy({
        email: "member@the ancestor site",
        password: "correct-password",
        callbackUrl: "/tasks",
      }),
    ).rejects.toThrow("REDIRECT:/tasks");
  });
});

function primeAtomicSuccess() {
  mockSignIn.mockResolvedValue(undefined);
  mockUsersFindFirst.mockResolvedValue({ id: "user-1" });
  // Row-4 shape (never owed a second factor) — the resolver's bare
  // callbackUrl-passthrough branch, the one this hardening protects.
  mockComputeSecondFactorPolicy.mockResolvedValue({
    owesSecondFactor: false,
    hasTotp: false,
  });
}

describe("signInWithCredentialsAtomic — callbackUrl hardening (same property, atomic path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeAtomicSuccess();
  });

  it("rejects an absolute external callbackUrl and falls back to the app default, not the attacker's host", async () => {
    await expect(
      signInWithCredentialsAtomic({
        email: "member@the ancestor site",
        password: "correct-password",
        callbackUrl: "https://evil.example/phish",
      }),
    ).rejects.toThrow(/^REDIRECT:/);

    expect(mockedRedirect).toHaveBeenCalledTimes(1);
    const destination = mockedRedirect.mock.calls[0][0] as string;
    expect(destination).not.toContain("evil.example");
    expect(destination).toBe("/home");
  });

  it("rejects a protocol-relative callbackUrl (//evil.example) and falls back to the app default", async () => {
    await expect(
      signInWithCredentialsAtomic({
        email: "member@the ancestor site",
        password: "correct-password",
        callbackUrl: "//evil.example",
      }),
    ).rejects.toThrow(/^REDIRECT:/);

    const destination = mockedRedirect.mock.calls[0][0] as string;
    expect(destination).not.toContain("evil.example");
    expect(destination).toBe("/home");
  });

  it("passes through a legitimate same-origin relative callbackUrl unchanged", async () => {
    await expect(
      signInWithCredentialsAtomic({
        email: "member@the ancestor site",
        password: "correct-password",
        callbackUrl: "/tasks",
      }),
    ).rejects.toThrow("REDIRECT:/tasks");
  });

  it("row 2 shape — admin-ish, unenrolled: redirects to /account/2fa with the sanitized callbackUrl attached, not the raw one", async () => {
    mockComputeSecondFactorPolicy.mockResolvedValue({
      owesSecondFactor: true,
      hasTotp: false,
    });
    await expect(
      signInWithCredentialsAtomic({
        email: "admin@the ancestor site",
        password: "correct-password",
        callbackUrl: "https://evil.example/phish",
      }),
    ).rejects.toThrow(/^REDIRECT:/);

    const destination = mockedRedirect.mock.calls[0][0] as string;
    expect(destination).not.toContain("evil.example");
    expect(destination).toBe("/account/2fa?callbackUrl=%2Fhome");
  });
});

describe("signInWithCredentialsAtomic — MFA_REQUIRED / MFA_UNREADABLE / wrong-code signal contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { mfaRequired: true } on MFA_REQUIRED — NOT a redirect, NOT a generic error", async () => {
    const err = new CredentialsSignin();
    (err as { code: string }).code = "MFA_REQUIRED";
    mockSignIn.mockRejectedValueOnce(err);

    const result = await signInWithCredentialsAtomic({
      email: "admin@the ancestor site",
      password: "correct-password",
      callbackUrl: "/home",
    });

    expect(result).toEqual({ mfaRequired: true });
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("returns a true, actionable error on MFA_UNREADABLE — never 'wrong code'", async () => {
    const err = new CredentialsSignin();
    (err as { code: string }).code = "MFA_UNREADABLE";
    mockSignIn.mockRejectedValueOnce(err);

    const result = await signInWithCredentialsAtomic({
      email: "admin@the ancestor site",
      password: "correct-password",
      totpCode: "123456",
      callbackUrl: "/home",
    });

    expect(result).toEqual({
      error: expect.stringContaining("can no longer be read"),
    });
    // Must not tell the user to try again with a new code — no code will
    // ever work until the secret is re-enrolled.
    expect((result as { error: string }).error).not.toMatch(/try again/i);
  });

  it("a wrong code (totpCode present) gets the code-specific message, not 'wrong email or password'", async () => {
    mockSignIn.mockRejectedValueOnce(new CredentialsSignin());

    const result = await signInWithCredentialsAtomic({
      email: "admin@the ancestor site",
      password: "correct-password",
      totpCode: "000000",
      callbackUrl: "/home",
    });

    expect(result).toEqual({
      error: "That code didn't match. Try again, or use a recovery code.",
    });
  });

  it("a wrong password (no totpCode) gets the generic credentials message", async () => {
    mockSignIn.mockRejectedValueOnce(new CredentialsSignin());

    const result = await signInWithCredentialsAtomic({
      email: "admin@the ancestor site",
      password: "wrong-password",
      callbackUrl: "/home",
    });

    expect(result).toEqual({ error: "Wrong email or password." });
  });
});
