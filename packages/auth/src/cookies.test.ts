import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  resolveCookieDomain,
  resolveSessionMaxAge,
  buildSharedCookies,
} from "./cookies";

/**
 * Guards Increment 2's (cross-app identity/SSO, docs/work-log/2026-09-02-
 * cross-app-identity-sso.md) critical safety property: with AUTH_COOKIE_DOMAIN
 * and SESSION_MAX_AGE_SECONDS both unset, behavior must be byte-identical to
 * pre-Increment-2 — host-only cookie, each app's existing session lifetime.
 * That's what makes it safe to ship this file before anyone flips the switch.
 */
describe("cookies", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("resolveCookieDomain", () => {
    it("returns undefined when nothing is set (today's host-only behavior)", () => {
      delete process.env.AUTH_COOKIE_DOMAIN;
      expect(resolveCookieDomain()).toBeUndefined();
    });

    it("ignores AUTH_COOKIE_DOMAIN outside NODE_ENV=production — hard constraint from Phase 2 Ruling 2", () => {
      vi.stubEnv("NODE_ENV", "development");
      process.env.AUTH_COOKIE_DOMAIN = ".example.org";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(resolveCookieDomain()).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toContain("AUTH_COOKIE_DOMAIN");
    });

    it("ignores an explicit domain argument outside NODE_ENV=production too", () => {
      vi.stubEnv("NODE_ENV", "test");
      vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(resolveCookieDomain(".example.org")).toBeUndefined();
    });

    it("honors AUTH_COOKIE_DOMAIN when NODE_ENV=production", () => {
      vi.stubEnv("NODE_ENV", "production");
      process.env.AUTH_COOKIE_DOMAIN = ".example.org";
      expect(resolveCookieDomain()).toBe(".example.org");
    });

    it("prefers an explicit argument over the env var when NODE_ENV=production", () => {
      vi.stubEnv("NODE_ENV", "production");
      process.env.AUTH_COOKIE_DOMAIN = ".env-value.org";
      expect(resolveCookieDomain(".explicit.org")).toBe(".explicit.org");
    });
  });

  describe("resolveSessionMaxAge", () => {
    it("falls back to DEFAULT_SESSION_MAX_AGE_SECONDS (24h) when unset", () => {
      delete process.env.SESSION_MAX_AGE_SECONDS;
      expect(resolveSessionMaxAge()).toBe(DEFAULT_SESSION_MAX_AGE_SECONDS);
      expect(resolveSessionMaxAge()).toBe(86400);
    });

    it("reads SESSION_MAX_AGE_SECONDS when set and no explicit override is given", () => {
      process.env.SESSION_MAX_AGE_SECONDS = "3600";
      expect(resolveSessionMaxAge()).toBe(3600);
    });

    it("prefers an explicit numeric override over the env var", () => {
      process.env.SESSION_MAX_AGE_SECONDS = "3600";
      expect(resolveSessionMaxAge(7200)).toBe(7200);
    });

    it("falls back to the default on an unparsable env value rather than propagating NaN", () => {
      process.env.SESSION_MAX_AGE_SECONDS = "not-a-number";
      expect(resolveSessionMaxAge()).toBe(DEFAULT_SESSION_MAX_AGE_SECONDS);
    });
  });

  describe("buildSharedCookies", () => {
    it("reproduces today's dev-mode cookie shape when domain is unset (NODE_ENV != production)", () => {
      vi.stubEnv("NODE_ENV", "development");
      const cookies = buildSharedCookies({});

      expect(cookies.sessionToken?.name).toBe("authjs.session-token");
      expect(cookies.sessionToken?.options?.secure).toBe(false);
      expect(cookies.sessionToken?.options?.domain).toBeUndefined();

      expect(cookies.csrfToken?.name).toBe("authjs.csrf-token");
      expect(cookies.csrfToken?.options?.secure).toBe(false);
      expect(cookies.csrfToken?.options?.domain).toBeUndefined();
    });

    it("reproduces Auth.js's own default production cookie shape when domain is unset", () => {
      vi.stubEnv("NODE_ENV", "production");
      const cookies = buildSharedCookies({});

      expect(cookies.sessionToken?.name).toBe("__Secure-authjs.session-token");
      expect(cookies.sessionToken?.options?.secure).toBe(true);
      expect(cookies.sessionToken?.options?.domain).toBeUndefined();

      // Auth.js's own default names the CSRF cookie __Host- when secure and
      // no domain override is in play — verified against
      // @auth/core@0.41.3's lib/utils/cookie.js.
      expect(cookies.csrfToken?.name).toBe("__Host-authjs.csrf-token");
      expect(cookies.csrfToken?.options?.domain).toBeUndefined();
    });

    it("renames the CSRF cookie from __Host- to __Secure- when a domain is set — the load-bearing fix, not cosmetic", () => {
      vi.stubEnv("NODE_ENV", "production");
      const cookies = buildSharedCookies({ domain: ".example.org" });

      expect(cookies.csrfToken?.name).toBe("__Secure-authjs.csrf-token");
      expect(cookies.csrfToken?.options?.domain).toBe(".example.org");
      expect(cookies.csrfToken?.options?.secure).toBe(true);

      // Updated 2026-09-06: this used to assert the session cookie kept its
      // name when a domain was introduced. That assertion encoded the bug —
      // see the suite below for why the rename is required.
      expect(cookies.sessionToken?.name).toBe(
        "__Secure-authjs.session-token.shared",
      );
      expect(cookies.sessionToken?.options?.domain).toBe(".example.org");
    });

    /**
     * Regression suite for the 2026-09-06 staging lockout, reported as
     * "redirected you too many times."
     *
     * A host-only cookie and a Domain cookie with the SAME NAME are two
     * distinct cookies (RFC 6265). Browsers keep both and send both, and the
     * server reads whichever appears first — so introducing
     * AUTH_COOKIE_DOMAIN left every existing browser shadowing the new
     * domain-scoped session cookie with a stale host-only one that signing in
     * could never overwrite. The gate saw "no session" on every request after
     * a successful login and bounced to /login forever.
     *
     * The rename is what makes the orphaned cookie inert.
     */
    describe("session cookie rename when a domain is introduced", () => {
      it("uses a DIFFERENT name with a domain than without — the orphan is never read", () => {
        vi.stubEnv("NODE_ENV", "production");
        const hostOnly = buildSharedCookies({});
        const scoped = buildSharedCookies({ domain: ".example.org" });

        expect(scoped.sessionToken?.name).not.toBe(hostOnly.sessionToken?.name);
      });

      it("keeps the __Secure- prefix, which permits Domain (unlike __Host-)", () => {
        vi.stubEnv("NODE_ENV", "production");
        const cookies = buildSharedCookies({ domain: ".example.org" });

        expect(cookies.sessionToken?.name).toMatch(/^__Secure-/);
        expect(cookies.sessionToken?.name).not.toMatch(/^__Host-/);
        // __Secure- requires secure + path=/; both must hold or the browser
        // silently drops the Set-Cookie header.
        expect(cookies.sessionToken?.options?.secure).toBe(true);
        expect(cookies.sessionToken?.options?.path).toBe("/");
      });

      it("renames in dev too, so the shadowing cannot be reproduced only in production", () => {
        vi.stubEnv("NODE_ENV", "development");
        const hostOnly = buildSharedCookies({});
        const scoped = buildSharedCookies({ domain: "localhost" });

        expect(hostOnly.sessionToken?.name).toBe("authjs.session-token");
        expect(scoped.sessionToken?.name).toBe("authjs.session-token.shared");
        expect(scoped.sessionToken?.name).not.toBe(hostOnly.sessionToken?.name);
      });

      it("leaves the no-domain name untouched, so nothing changes where SSO is off", () => {
        vi.stubEnv("NODE_ENV", "production");
        expect(buildSharedCookies({}).sessionToken?.name).toBe(
          "__Secure-authjs.session-token",
        );
      });

      it("renames the session and CSRF cookies together — both shadow, for the same reason", () => {
        vi.stubEnv("NODE_ENV", "production");
        const hostOnly = buildSharedCookies({});
        const scoped = buildSharedCookies({ domain: ".example.org" });

        expect(scoped.sessionToken?.name).not.toBe(hostOnly.sessionToken?.name);
        expect(scoped.csrfToken?.name).not.toBe(hostOnly.csrfToken?.name);
      });
    });

    it("sets httpOnly, sameSite=lax, and path=/ on both cookies regardless of domain", () => {
      const cookies = buildSharedCookies({ domain: ".example.org" });
      for (const key of ["sessionToken", "csrfToken"] as const) {
        expect(cookies[key]?.options?.httpOnly).toBe(true);
        expect(cookies[key]?.options?.sameSite).toBe("lax");
        expect(cookies[key]?.options?.path).toBe("/");
      }
    });
  });
});
