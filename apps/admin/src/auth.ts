import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users, userTotp } from "@/lib/db/schema";
import {
  createAuth,
  computeSharedJwtClaims,
  decryptSecret,
  TotpSecretUndecryptableError,
  verifyToken,
  checkLockout,
  LOCKOUT_THRESHOLD,
  LOCKOUT_DURATION_SECONDS,
  normalizeRecoveryCode,
} from "@repo/auth";
// Subpath, not the barrel — apps/portal/docs/work-log/2026-09-08-2fa-
// atomic-convergence.md's Increment 2 note (a predecessor app's own src/lib/auth.ts
// carries the identical import split): the barrel re-exports factory.ts,
// which pulls in "next-auth" and breaks under Vitest's Node test
// environment for anything that only needs this one narrow function.
import { verifyRecoveryCode } from "@repo/auth/verify-recovery-code";
import { FEATURES } from "@repo/permissions";
import { getRequestIp } from "@/lib/request-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

const FEATURE_KEYS = Object.values(FEATURES) as string[];

// e2e-only rate-limit elevation (docs/work-log/2026-09-05-e2e-fixture-
// determinism.md). This app's atomic authorize() below submits credentials
// TWICE per TOTP-enrolled login — once bare (throws MFA_REQUIRED), once with
// the code (see admin-sign-in-form.tsx) — so a Playwright suite that signs
// in repeatedly as one fixture identity legitimately needs more than 5
// authorize() calls/minute. Both values default to the exact numbers that
// were previously hardcoded (production-safe, unchanged unless explicitly
// overridden) and neither has an entry in this app's Vercel project, so
// this is a no-op in production. Mirrors a predecessor app's src/lib/rate-limit.ts's
// RATE_LIMIT_LOGIN_MAX precedent — see apps/admin/playwright.config.ts's
// webServer.env (spawned e2e server) and the new `npm run dev:e2e` script
// (elevating an already-running interactive dev server for a session, the
// only option Next 16's directory-scoped dev-server lock leaves when e2e
// must join a server someone is already running rather than spawn its own).
const SIGNIN_RATE_LIMIT_MAX = Number.parseInt(process.env.RATE_LIMIT_LOGIN_MAX ?? "5", 10);
const SIGNIN_RATE_LIMIT_WINDOW_SECONDS = Number.parseInt(
  process.env.RATE_LIMIT_LOGIN_WINDOW_SECONDS ?? "60",
  10,
);

// 2FA atomic-convergence Increment 3 (2026-09-08 — apps/portal/docs/
// work-log/2026-09-08-2fa-atomic-convergence.md Phase 3 § 3.3; root
// docs/decisions.md DECISION-022 point 4): a distinct budget for the
// TOTP-code-guessing step, separate from SIGNIN_RATE_LIMIT_MAX above.
// Before this, a TOTP-guessing attacker (who already has a valid
// password) shared the SAME signin:${ip}:${email} bucket as password
// guessing — meaning the 5/min signin budget was already consumed by the
// one successful password submission, leaving the attacker free to guess
// TOTP codes at whatever rate they liked. Same env-var name and default
// (5/60s) as a predecessor app's own RATE_LIMIT_MFA_MAX/_WINDOW_SECONDS convention —
// seconds-based here (this file's own checkRateLimit signature, matching
// SIGNIN_RATE_LIMIT_WINDOW_SECONDS immediately above), not a predecessor app's
// ms-based in-memory limiter.
const TOTP_RATE_LIMIT_MAX = Number.parseInt(process.env.RATE_LIMIT_MFA_MAX ?? "5", 10);
const TOTP_RATE_LIMIT_WINDOW_SECONDS = Number.parseInt(
  process.env.RATE_LIMIT_MFA_WINDOW_SECONDS ?? "60",
  10,
);

/**
 * Admin's node-side NextAuth instance — the third caller of
 * packages/auth's createAuth() (DECISION-054 point 3; factory.ts's own
 * header names this exact shape as what it was built for). Standalone for
 * now — NOT part of the shared SSO cookie domain yet (umbrella Ruling
 * 1/5): no cookieDomain/sessionMaxAge overrides, matching Portal's/
 * a predecessor app's own default resolution when those env vars are unset.
 *
 * Deliberately NO ensureDefaultRole()-equivalent (contrast with
 * apps/portal/src/auth.ts): a brand-new Admin user — whether
 * created via createUserAction, approveRequestAction, or a self-service
 * Google sign-in from a stranger the DrizzleAdapter auto-creates a row
 * for — gets ZERO roles by default. Directive point 4 / Flow 4's whole
 * design is that a zero-role authenticated visitor lands on
 * /access-pending; auto-binding a default role here would silently defeat
 * that gate for every new row.
 */
export const { handlers, auth, signIn, signOut, unstable_update } = createAuth({
  db,
  signInPage: "/signin",
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Google verifies email ownership at sign-in — linking an existing
      // user record (e.g. one createUserAction pre-created with
      // signInMethod: "google") by email is safe. Matches
      // apps/portal/src/auth.ts's own precedent and its own warning: only
      // safe because Google is the sole OAuth provider here.
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "Email + Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "TOTP Code", type: "text" },
      },
      async authorize(credentials, request) {
        const email = (credentials?.email as string | undefined)?.toLowerCase();
        const password = credentials?.password as string | undefined;
        const totpCode = credentials?.totpCode as string | undefined;
        if (!email || !password) return null;

        const ip = getRequestIp(
          (request as Request | undefined)?.headers ?? new Headers(),
        );

        // Rate limit: 5/min (default) keyed by ip:email composite — same
        // shape as apps/portal/src/auth.ts's own credentials rate limit.
        // Overridable only via env (see SIGNIN_RATE_LIMIT_MAX's own comment
        // above) — never weakened for production or for an untouched
        // interactive dev session.
        const limited = await checkRateLimit(
          `signin:${ip ?? "unknown"}:${email}`,
          { max: SIGNIN_RATE_LIMIT_MAX, windowSeconds: SIGNIN_RATE_LIMIT_WINDOW_SECONDS },
          { userId: null, actor: email, reason: "credentials_signin" },
        );
        if (!limited.allowed) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
        // No password set (Google-only pre-authorization, or an invite
        // that hasn't been consumed via /set-password yet) — reject via
        // the same code path as a wrong password, no enumeration leak.
        if (!user?.password || !user.isActive) return null;

        // Account lockout (2026-09-05 ad-hoc security audit finding): this
        // app had no lockout mechanism at all — only the 5/min rate limit
        // above, which caps an attacker at ~7,200 guesses/day against any
        // Admin account indefinitely. Ports a predecessor app's src/lib/auth.ts's
        // proven pattern verbatim, using the same shared @repo/auth
        // constants (LOCKOUT_THRESHOLD=5, LOCKOUT_DURATION_SECONDS=900)
        // Portal already uses. Password checks only — a wrong TOTP code
        // below is not counted toward this counter, matching the other two
        // apps' invariant.
        const now = new Date();
        const lockStatus = checkLockout(user, now);
        if (lockStatus.locked) return null;
        if (lockStatus.resetCounter) {
          await db
            .update(users)
            .set({ failedLoginAttempts: 0, lockedUntil: null })
            .where(eq(users.id, user.id));
        }

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
          // Atomic conditional-increment — same pattern as a predecessor app's/
          // Portal's own authorize().
          await db
            .update(users)
            .set({
              failedLoginAttempts: sql`failed_login_attempts + 1`,
              lockedUntil: sql`
                CASE WHEN failed_login_attempts + 1 >= ${LOCKOUT_THRESHOLD}
                  THEN now() + make_interval(secs => ${LOCKOUT_DURATION_SECONDS})
                  ELSE locked_until
                END
              `,
            })
            .where(eq(users.id, user.id));
          return null;
        }

        // 2026-09-04 urgent fix (docs/work-log/2026-09-04-totp-per-login-
        // gap.md): require + validate totpCode atomically in THIS call,
        // before a session is ever issued — ports a predecessor app's src/lib/
        // auth.ts's proven-safe authorize()-level MFA gate verbatim. Prior
        // to this, a TOTP-enrolled user's password alone signed them in on
        // every subsequent login: `token.twoFactorVerified` was set once at
        // enrollment and never read anywhere (proxy.ts only checks
        // `!user.hasTotp`, which stays true forever once enrolled). The
        // secret lives AES-256-GCM-encrypted in the shared `userTotp` table
        // — same at-rest shape as a predecessor app's and Portal's own TOTP storage.
        const totpRow = await db.query.userTotp.findFirst({
          where: eq(userTotp.userId, user.id),
        });
        if (totpRow) {
          if (!totpCode) {
            // Correct password but no MFA code submitted yet — signal the
            // client to show the code-entry step. This is NOT a failed
            // login attempt.
            const err = new CredentialsSignin();
            err.code = "MFA_REQUIRED";
            throw err;
          }

          // Distinct TOTP-guess rate limit (see TOTP_RATE_LIMIT_MAX's own
          // comment above) — checked here, not folded into the signin:
          // bucket that already ran unconditionally above this block.
          // checkRateLimit already writes RATE_LIMIT_BLOCKED to
          // audit_events on rejection — no separate audit call needed here.
          const totpLimited = await checkRateLimit(
            `totp:${ip ?? "unknown"}:${email}`,
            { max: TOTP_RATE_LIMIT_MAX, windowSeconds: TOTP_RATE_LIMIT_WINDOW_SECONDS },
            { userId: user.id, actor: email, reason: "totp_guess" },
          );
          if (!totpLimited.allowed) return null;

          // Shape-sniff BEFORE touching any stored secret material.
          // normalizeRecoveryCode rejects a 6-digit numeric string by
          // construction (its own ^[A-Z0-9-]{8,10}$ length gate), so this
          // dispatch is unambiguous. Decrypting the TOTP secret is deferred
          // into the six-digit branch alone, deliberately NOT hoisted above
          // this dispatch: a recovery-code submission never needs the TOTP
          // secret at all (different stored material —
          // userTotpRecoveryCodes vs. userTotp.secretCiphertext), and
          // decrypting unconditionally would throw MFA_UNREADABLE at a
          // VALID recovery code whenever the stored TOTP secret happens to
          // be undecryptable (e.g. after an AUTH_TOTP_ENCRYPTION_KEY
          // rotation) — exactly the scenario recovery codes exist to
          // survive. Matches a predecessor app's/Portal's own already-shipped
          // authorizeAtomic branch order (2FA atomic-convergence, Increment
          // 2 Entry check #2 / DECISION-022).
          const normalizedRecovery = normalizeRecoveryCode(totpCode);

          if (normalizedRecovery) {
            const result = await verifyRecoveryCode(db, user.id, totpCode);
            if (!result.ok) {
              await recordAudit({
                action: AUDIT_ACTIONS.TOTP_RECOVERY_FAILED,
                actor: { userId: user.id, email: user.email },
              });
              return null;
            }
            await recordAudit({
              action: AUDIT_ACTIONS.TOTP_RECOVERY_SUCCESS,
              actor: { userId: user.id, email: user.email },
            });
          } else {
            // An unreadable stored secret (normally: AUTH_TOTP_ENCRYPTION_KEY
            // was rotated after this user enrolled) is not a wrong password and
            // not a wrong code. Reporting it as either sends the person into an
            // unwinnable retry loop, and letting it throw raw surfaces a bare
            // 500 on the sign-in page. Signal it distinctly instead.
            let secret: string;
            try {
              secret = decryptSecret(totpRow.secretCiphertext);
            } catch (e) {
              if (!(e instanceof TotpSecretUndecryptableError)) throw e;
              const err = new CredentialsSignin();
              err.code = "MFA_UNREADABLE";
              throw err;
            }
            if (!verifyToken(totpCode, secret)) {
              // 2FA atomic-convergence Increment 3 (closes a real gap: this
              // app previously wrote NOTHING on a wrong TOTP code — the
              // highest-privilege app in the monorepo, logging zero
              // evidence of a failed second-factor attempt).
              await recordAudit({
                action: AUDIT_ACTIONS.TOTP_VERIFY_FAILED,
                actor: { userId: user.id, email: user.email },
              });
              return null;
            }
            await db
              .update(userTotp)
              .set({ lastUsedAt: new Date() })
              .where(eq(userTotp.userId, user.id));
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // credentials → true unconditionally, authorize() already checked
      // password + isActive. OAuth (google) → true; the adapter creates
      // the row if it doesn't exist yet (self-service, lands with zero
      // roles at /access-pending), or resolves the existing
      // admin-pre-created row by email.
      if (account?.provider !== "google") return true;

      // DECISION-055 point 4: the Google-OAuth-pre-authorized path's
      // accountStatus 'invited' -> 'active' transition happens HERE, at
      // the first successful Google sign-in for that row — an app-local
      // signIn callback override, per packages/auth/src/factory.ts's own
      // "app-specific logic stays in each app's own src/auth.ts" design.
      if (user?.email) {
        const existing = await db.query.users.findFirst({
          where: eq(users.email, user.email.toLowerCase()),
          columns: { id: true, accountStatus: true },
        });
        if (existing && existing.accountStatus === "invited") {
          await db
            .update(users)
            .set({ accountStatus: "active" })
            .where(eq(users.id, existing.id));
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user?.id) {
        token.sub = user.id;
        // twoFactorVerified deliberately left unset here (2026-09-04 fix,
        // docs/work-log/2026-09-04-totp-per-login-gap.md): this app's
        // authorize() above now gates TOTP atomically, the same way
        // a predecessor app's src/lib/auth.ts's own jwt() callback never sets
        // this field either — there is no post-login "verified" state left
        // to track since no session is issued until the code is checked.
        // Session-projection defaults an unset token.twoFactorVerified to
        // `false`, which is harmless: nothing in this app reads it (only
        // Portal's separate-route model does).
        token.roles = undefined;
        await db
          .update(users)
          .set({ lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null })
          .where(eq(users.id, user.id));
      }

      if (trigger === "update" && session?.user) {
        if (Array.isArray(session.user.roles)) {
          token.roles = session.user.roles;
        }
        if (Array.isArray(session.user.features)) {
          token.features = session.user.features;
        }
      }

      if (!token.sub) return token;

      // Every request re-derives isActive/hasTotp/roles/features from the
      // DB (stale-JWT defense, same discipline both other apps' auth.ts
      // files use) — this app's proxy.ts gate depends on hasTotp being
      // fresh on every request, not just at sign-in, so refreshRoles could
      // in principle be narrowed the way Portal narrows it, but hasTotp
      // itself is ALWAYS recomputed by computeSharedJwtClaims regardless
      // of refreshRoles (see packages/auth/src/jwt.ts) — only
      // roles/features are gated by that flag.
      const needsRoleRefresh = !token.roles || trigger === "update" || !!user;
      const claims = await computeSharedJwtClaims(db, token.sub, {
        featureKeys: FEATURE_KEYS,
        refreshRoles: needsRoleRefresh,
        // Revocation-freshness (DECISION-023) — a SECOND, independent
        // reason to refresh roles/features this request, additive to
        // needsRoleRefresh above. Rides the SELECT computeSharedJwtClaims
        // already issues unconditionally; adds zero queries here. This is
        // the app whose entire stated purpose is cross-app access
        // revocation, so closing this gap matters most here.
        currentRolesVersion: token.rolesVersion,
      });
      if (!claims) {
        // Row vanished or got deactivated — empty token signs the user out.
        return {};
      }
      token.isActive = claims.isActive;
      // Admin's 2FA gate is unconditional (DECISION-054 point 4) —
      // no auth.require_2fa-style flag to combine with the raw column, in
      // contrast with Portal's computeEffectiveTwoFactor(). twoFactorRequired
      // is still threaded onto the token for shape-parity with the shared
      // Session type; src/proxy.ts's own gate reads hasTotp directly, not
      // this field.
      token.twoFactorRequired = claims.twoFactorRequired;
      if (claims.email) token.email = claims.email;
      token.mustChangePassword = claims.mustChangePassword;
      token.hasTotp = claims.hasTotp;
      // Unconditional every request, mirrors token.globalRole above —
      // DECISION-023. Compared against on the NEXT request's
      // currentRolesVersion.
      token.rolesVersion = claims.rolesVersion;

      if (claims.roles) token.roles = claims.roles;
      if (claims.features) token.features = claims.features;
      return token;
    },
  },
});
