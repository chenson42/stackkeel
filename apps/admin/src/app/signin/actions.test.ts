/**
 * Regression test for Increment 0 of the atomic 2FA convergence
 * (apps/portal/docs/work-log/2026-09-08-2fa-atomic-convergence.md, Phase 1
 * Adversarial Pass finding 1 / Claims Ledger row 4): `signInWithCredentials`
 * took a caller-supplied `callbackUrl` and passed it straight into
 * `resolvePostSignInDestination()` and then `redirect()`, without
 * re-sanitizing. This Server Action is directly invocable with an arbitrary
 * payload by anyone who can reach its action reference — not only through
 * the rendered form — so `src/app/signin/page.tsx`'s own
 * `sanitizeCallbackUrl()` call on the GET-render path does not protect this
 * one. Fixed by re-sanitizing at the actual enforcement site.
 *
 * Drives the REAL `signInWithCredentials` (not a reimplemented predicate),
 * so reverting the fix in `src/app/signin/actions.ts` makes this file fail
 * — confirmed live this session (see the work-log's Increment 0 section for
 * the literal before/after output).
 *
 * MODULE-IMPORT NOTE (mirrors src/auth.test.ts's own header): importing the
 * real "next-auth" package barrel fails under Vitest (next-auth/lib/env.js
 * pulls in "next/server", which Vitest's Node environment can't resolve).
 * Only the "next-auth" barrel itself is mocked, using the REAL
 * `@auth/core/errors` classes (not hand-rolled stand-ins) so `instanceof`
 * checks against production's own `AuthError`/`CredentialsSignin` stay
 * meaningful.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AuthError as RealAuthError,
  CredentialsSignin as RealCredentialsSignin,
} from "@auth/core/errors";

// ---------------------------------------------------------------------------
// Mocks — vi.mock() calls are hoisted above imports by Vitest's transform.
// ---------------------------------------------------------------------------

vi.mock("next-auth", () => ({
  AuthError: RealAuthError,
  CredentialsSignin: RealCredentialsSignin,
}));

// redirect() throws in real Next.js — mocked the same way
// src/app/(app)/*/actions.test.ts and every other actions.test.ts in this
// repo mocks it, so the URL argument can be asserted on instead of losing it
// to an unobservable real navigation.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const mockSignIn = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ signIn: mockSignIn }));

const mockUsersFindFirst = vi.hoisted(() => vi.fn());
const mockUserTotpFindFirst = vi.hoisted(() => vi.fn());
const mockSelectWhere = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: { findFirst: mockUsersFindFirst },
      userTotp: { findFirst: mockUserTotpFindFirst },
    },
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: mockSelectWhere,
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: { email: "email" },
  userRoles: { userId: "userId", roleId: "roleId" },
  roles: { id: "id", name: "name" },
}));

import { redirect } from "next/navigation";
import { signInWithCredentials } from "./actions";

const mockedRedirect = vi.mocked(redirect);

// Admin-ish + enrolled: the only branch of resolvePostSignInDestination that
// actually returns `callbackUrl` (both other branches — no role, no TOTP —
// redirect to a fixed destination regardless of callbackUrl, which would
// make this test prove nothing about sanitization). See
// packages/auth/src/post-signin.ts's resolveAdminPostSignInDestination.
function primeAdminIshEnrolledUser() {
  mockSignIn.mockResolvedValue(undefined);
  mockUsersFindFirst.mockResolvedValue({ id: "user-1" });
  mockSelectWhere.mockResolvedValue([{ name: "admin" }]);
  mockUserTotpFindFirst.mockResolvedValue({ userId: "user-1" });
}

describe("signInWithCredentials — Increment 0 callbackUrl hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeAdminIshEnrolledUser();
  });

  it("rejects an absolute external callbackUrl and falls back to the app default, not the attacker's host", async () => {
    await expect(
      signInWithCredentials({
        email: "admin@the ancestor site",
        password: "correct-password",
        totpCode: "123456",
        callbackUrl: "https://evil.example/phish",
      }),
    ).rejects.toThrow(/^REDIRECT:/);

    expect(mockedRedirect).toHaveBeenCalledTimes(1);
    const destination = mockedRedirect.mock.calls[0][0] as string;
    expect(destination).not.toContain("evil.example");
    expect(destination).toBe("/users"); // ADMIN's own fallback, apps/admin/src/lib/auth/post-signin.ts
  });

  it("rejects a protocol-relative callbackUrl (//evil.example) and falls back to the app default", async () => {
    await expect(
      signInWithCredentials({
        email: "admin@the ancestor site",
        password: "correct-password",
        totpCode: "123456",
        callbackUrl: "//evil.example",
      }),
    ).rejects.toThrow(/^REDIRECT:/);

    const destination = mockedRedirect.mock.calls[0][0] as string;
    expect(destination).not.toContain("evil.example");
    expect(destination).toBe("/users");
  });

  it("passes through a legitimate same-origin relative callbackUrl unchanged", async () => {
    await expect(
      signInWithCredentials({
        email: "admin@the ancestor site",
        password: "correct-password",
        totpCode: "123456",
        callbackUrl: "/audit",
      }),
    ).rejects.toThrow("REDIRECT:/audit");
  });
});
