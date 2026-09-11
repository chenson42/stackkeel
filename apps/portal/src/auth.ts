import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import type { User } from "next-auth";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users, userRoles, roles, userTotp } from "@/lib/db/schema";
import {
  createAuth,
  checkLockout,
  LOCKOUT_THRESHOLD,
  LOCKOUT_DURATION_SECONDS,
  computeSharedJwtClaims,
} from "@repo/auth";
import { evaluateSignIn } from "@/lib/auth/sign-in-gate";
import { ADMIN_ROLE, FEATURES, MEMBER_ROLE } from "@/lib/permissions";
import { getRequestIp } from "@/lib/request-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import {
  isLocalLoginEnabled,
  computeEffectiveTwoFactor,
} from "@/lib/auth/local-login";
import { verifyTurnstile } from "@/lib/turnstile";
import { isFlagEnabled } from "@/lib/flags";
import {
  ATOMIC_TOTP_FLAG,
  computeSecondFactorPolicy,
} from "@/lib/auth/second-factor-policy";
// PROMOTED to packages/auth 2026-09-08 (2FA atomic-convergence Increment 2,
// DECISION-022 point 2) — a predecessor app and the platform Admin (Increment 3) both
// need this identical, already-generic function; a third local copy would
// be exactly the fork UX-PATTERNS.md § 1 forbids. Same subpath-export
// pattern as the other packages/auth imports below (no next-auth
// dependency in this module, so unlike computeSharedJwtClaims it never
// needed a bare-barrel-vs-Vitest workaround in the first place).
import { verifyRecoveryCode } from "@repo/auth/verify-recovery-code";
import {
  decryptSecret,
  verifyToken,
  TotpSecretUndecryptableError,
} from "@/lib/two-factor";

const INITIAL_ADMIN_EMAILS = (process.env.INITIAL_ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const FEATURE_KEYS = Object.values(FEATURES) as string[];

/**
 * Loosely-typed credentials shape shared by both authorize()
 * implementations below — matches next-auth's own
 * `Partial<Record<keyof CredentialsInputs, unknown>>` contract for the
 * fields declared in the `Credentials({ credentials: {...} })` config
 * further down (same fields, not re-derived).
 */
type PortalCredentialsInput = Partial<
  Record<"email" | "password" | "turnstileToken" | "totpCode", unknown>
>;

/**
 * Bind a freshly-signed-in user to a default role if they have none.
 *
 * Two reasons we do this here rather than relying on `events.createUser`:
 *
 *   1. `events.createUser` is fire-and-forget — the JWT callback can run
 *      before its async role insert completes, leaving the user with an
 *      empty `roles` array on first request.
 *   2. Credentials users skip the adapter entirely, so `events.createUser`
 *      never fires for them at all (this is why the seed script binds the
 *      local admin's role directly).
 *
 * Idempotent: returns early if the user already holds at least one role.
 * Portal-specific — a predecessor app has no self-service OAuth signup, so it has no
 * equivalent bootstrapping concern (see this milestone's work-log, design
 * call #1).
 */
async function ensureDefaultRole(
  userId: string,
  email: string | null,
): Promise<void> {
  const existing = await db.query.userRoles.findFirst({
    where: eq(userRoles.userId, userId),
  });
  if (existing) return;
  const desiredRoleName = email && INITIAL_ADMIN_EMAILS.includes(email.toLowerCase())
    ? ADMIN_ROLE
    : MEMBER_ROLE;
  const role = await db.query.roles.findFirst({
    where: eq(roles.name, desiredRoleName),
  });
  if (!role) return;
  await db
    .insert(userRoles)
    .values({ userId, roleId: role.id })
    .onConflictDoNothing();
}

/**
 * LEGACY authorize() — TODAY's exact function body prior to the 2026-09-08
 * atomic-2FA convergence (2026-09-08-2fa-atomic-convergence.md Phase 3 § 8),
 * renamed verbatim, zero logic changes. Runs whenever ATOMIC_TOTP_FLAG is
 * off — including in every environment that hasn't seeded the flag row at
 * all (isFlagEnabledFor defaults a missing row to false). Never issues a
 * session with a cleared TOTP check; `/totp` (src/app/(auth)/totp/
 * actions.ts) remains the separate-route completion step for this path,
 * unchanged and untouched by this increment, and must stay mounted for as
 * long as any pre-flip `twoFactorVerified: false` session can still be in
 * flight (Phase 3 § 8, half-deployed behavior).
 */
async function authorizeLegacy(
  credentials: PortalCredentialsInput,
  request: Request,
): Promise<User | null> {
  const email = (credentials?.email as string | undefined)?.toLowerCase();
  const password = credentials?.password as string | undefined;
  if (!email || !password) return null;

  // Step 0: auth.local_login flag check — BEFORE rate limit so a
  // disabled-flag rejection does not consume rate-limit budget on a
  // permanently-blocked code path. Fail-open: missing row or DB error
  // → allow credentials through (DECISION-026).
  const localLoginEnabled = await isLocalLoginEnabled();
  if (!localLoginEnabled) return null;

  // Extract IP early — shared by step 0.5 (Turnstile) and step 1 (rate limit).
  // NextAuth 5 beta passes the original Request as the second arg.
  // If headers are unavailable the key degrades to "unknown" — still a
  // meaningful per-email rate limit.
  const ip = getRequestIp(
    (request as Request | undefined)?.headers ?? new Headers(),
  );

  // Step 0.5: Turnstile verification — BEFORE rate limit so bot traffic
  // does not consume rate-limit budget. Fail-open when TURNSTILE_SECRET_KEY
  // is unset (the starter default, DECISION-026). Surfaces to the user as
  // CredentialsSignin — no leakage about why the check failed.
  const turnstileOk = await verifyTurnstile(
    credentials?.turnstileToken as string | undefined,
    ip,
  );
  if (!turnstileOk) return null;

  // Rate limit: 5/min keyed by ip:email composite.
  const limited = await checkRateLimit(
    `signin:${ip ?? "unknown"}:${email}`,
    { max: 5, windowSeconds: 60 },
    { userId: null, actor: email, reason: "credentials_signin" },
  );
  if (!limited.allowed) return null; // NextAuth surfaces CredentialsSignin

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!user?.password || !user.isActive) return null;

  // Step 5: lockout check (credentials path only — see lockout.ts header).
  // Returns null via the same code path as wrong-password to prevent enumeration.
  const now = new Date();
  const lockStatus = checkLockout(user, now);
  if (lockStatus.locked) return null;

  // Step 5b: lock window has expired — reset the counter before calling bcrypt
  // so the user gets a fresh LOCKOUT_THRESHOLD window, not an immediate re-lock
  // on the first failure after expiry (Gap 2 fix; see lockout.ts LockoutState.resetCounter).
  if (lockStatus.resetCounter) {
    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
  }

  const ok = await bcrypt.compare(password, user.password);

  if (!ok) {
    // Atomic conditional-increment. Single UPDATE avoids the SELECT-then-write
    // race that could cause both the lock set and the audit event to double-fire
    // under concurrent requests. See DECISION-025 and the Phase 3 design doc for
    // full SQL semantics. Untyped sql`` (no generic) is intentional — the type
    // parameter is unnecessary on .set() RHS expressions in Drizzle.
    const [updated] = await db
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
      .where(eq(users.id, user.id))
      .returning({
        failedLoginAttempts: users.failedLoginAttempts,
        lockedUntil: users.lockedUntil,
      });

    // The account was not locked when we reached bcrypt (checkLockout above).
    // Any non-null lockedUntil in RETURNING means the lock was set right now.
    if (updated?.lockedUntil != null) {
      void recordAudit({
        action: AUDIT_ACTIONS.USER_ACCOUNT_LOCKED,
        actor: { userId: user.id, email: user.email },
        resourceType: "user",
        resourceId: user.id,
        metadata: {
          failedAttempts: LOCKOUT_THRESHOLD,
          lockedUntilEpochMs: updated.lockedUntil.getTime(),
        },
      });
    }
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
  };
}

/**
 * ATOMIC authorize() — 2026-09-08 convergence, Increment 1 (Portal).
 * Requires + validates a second factor (6-digit TOTP or XXXX-XXXX recovery
 * code) in THIS call, before a session is ever issued — mirrors
 * apps/admin/src/auth.ts's proven-safe atomic shape. Runs only when
 * ATOMIC_TOTP_FLAG is on (see the `authorize` dispatcher inside
 * createAuth() below).
 *
 * The second-factor CHALLENGE decision is `hasTotp` alone (does a userTotp
 * row exist), exactly mirroring Admin's own `if (totpRow) {...}` shape —
 * NOT `owesSecondFactor`. `owesSecondFactor` (second-factor-policy.ts) is
 * consumed downstream instead: by the atomic sign-in action's post-signin
 * resolver (atomic-post-signin.ts, ux-developer's file, not this one) to
 * decide whether to nudge an admin-ish-but-unenrolled user (row 2) to
 * /account/2fa, and by proxy.ts's § 7(a) mid-session-escalation block
 * below. Row 2 (admin-ish, not enrolled) has `owesSecondFactor: true` but
 * `hasTotp: false` — no userTotp row exists, so this function's TOTP
 * branch is never entered and the session is issued password-only,
 * exactly like a never-enrolled ordinary member (row 4). Nothing to
 * atomically gate on for either.
 */
async function authorizeAtomic(
  credentials: PortalCredentialsInput,
  request: Request,
): Promise<(User & { atomicTotpEnabled: true }) | null> {
  const email = (credentials?.email as string | undefined)?.toLowerCase();
  const password = credentials?.password as string | undefined;
  const totpCode = (credentials?.totpCode as string | undefined)?.trim();
  if (!email || !password) return null;

  const localLoginEnabled = await isLocalLoginEnabled();
  if (!localLoginEnabled) return null;

  const ip = getRequestIp(
    (request as Request | undefined)?.headers ?? new Headers(),
  );

  // Step 0.5: Turnstile — ONLY on the password-only submission. The
  // totpCode-bearing resubmission carries the SAME already-consumed
  // password (client-held state, ux-developer's PortalSignInForm) but a
  // Turnstile token is single-use server-side; TotpVerifyForm has no slot
  // to collect a second one. The surface Turnstile defends (password
  // guessing) is fully behind step 1 — a totpCode-bearing call is only
  // reachable after passing it once. The code-guessing surface is
  // separately defended by the re-keyed TOTP rate limit below. Phase 2 § 4
  // / Phase 3 § 6's ruling, exact shape.
  if (!totpCode) {
    const turnstileOk = await verifyTurnstile(
      credentials?.turnstileToken as string | undefined,
      ip,
    );
    if (!turnstileOk) return null;
  }

  // Rate limit: 5/min keyed by ip:email composite — same shape and budget
  // as the legacy path, applies to BOTH submissions (password is resent
  // on the totpCode-bearing call too).
  const limited = await checkRateLimit(
    `signin:${ip ?? "unknown"}:${email}`,
    { max: 5, windowSeconds: 60 },
    { userId: null, actor: email, reason: "credentials_signin" },
  );
  if (!limited.allowed) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!user?.password || !user.isActive) return null;

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
    // Same atomic conditional-increment lockout logic as the legacy path —
    // password-guess lockout is unaffected by this convergence. A wrong
    // TOTP/recovery code below is NOT counted toward this counter, matching
    // Admin's own invariant (apps/admin/src/auth.ts:131-148's own comment).
    const [updated] = await db
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
      .where(eq(users.id, user.id))
      .returning({
        failedLoginAttempts: users.failedLoginAttempts,
        lockedUntil: users.lockedUntil,
      });
    if (updated?.lockedUntil != null) {
      void recordAudit({
        action: AUDIT_ACTIONS.USER_ACCOUNT_LOCKED,
        actor: { userId: user.id, email: user.email },
        resourceType: "user",
        resourceId: user.id,
        metadata: {
          failedAttempts: LOCKOUT_THRESHOLD,
          lockedUntilEpochMs: updated.lockedUntil.getTime(),
        },
      });
    }
    return null;
  }

  // Correct password. Decide whether a second factor is owed — hasTotp
  // alone (see this function's own header comment for why owesSecondFactor
  // is NOT consulted here).
  const policy = await computeSecondFactorPolicy(db, user.id);
  const actor = { userId: user.id, email: user.email };

  if (policy.hasTotp) {
    if (!totpCode) {
      // Correct password, TOTP enrolled, no code submitted yet — signal
      // the client to render the code-entry step. This is NOT a failed
      // login attempt (mirrors Admin's own MFA_REQUIRED shape verbatim).
      const err = new CredentialsSignin();
      err.code = "MFA_REQUIRED";
      throw err;
    }

    // Rate limit the code guess — RE-KEYED off pre-session identity
    // (Phase 3 § 4). The legacy /totp path's mfaLimiter/checkRateLimit is
    // keyed `totp:${session.user.id}` — no session exists yet at this
    // point in the atomic model (rows 1/3 haven't been issued one). New
    // key mirrors the password limiter's own shape one block above,
    // different prefix/budget (10/min, unchanged from the legacy /totp
    // limiter's own budget).
    const totpLimited = await checkRateLimit(
      `totp:${ip ?? "unknown"}:${email}`,
      { max: 10, windowSeconds: 60 },
      { userId: user.id, actor: user.email ?? email, reason: "totp_verify_atomic" },
    );
    if (!totpLimited.allowed) return null;

    const totpRow = await db.query.userTotp.findFirst({
      where: eq(userTotp.userId, user.id),
    });
    if (!totpRow) {
      // Defensive only: computeSecondFactorPolicy's own read said a row
      // exists (same underlying table, queried a second time here to get
      // the ciphertext computeSharedJwtClaims doesn't return). An
      // enrollment deleted between the two reads is an unexercised TOCTOU
      // sliver, not a real path — treat as no-match rather than throw.
      return null;
    }

    const isSixDigit = /^\d{6}$/.test(totpCode);

    if (isSixDigit) {
      let secret: string;
      try {
        secret = decryptSecret(totpRow.secretCiphertext);
      } catch (e) {
        if (!(e instanceof TotpSecretUndecryptableError)) throw e;
        // Normally: AUTH_TOTP_ENCRYPTION_KEY was rotated after this user
        // enrolled. No authenticator code will ever match. Distinct code,
        // ported from Admin's own MFA_UNREADABLE shape and Portal's own
        // /totp copy (src/app/(auth)/totp/actions.ts's
        // UNDECRYPTABLE_SECRET_ERROR) — the client action (ux-developer)
        // owns the user-facing message text for this code.
        const err = new CredentialsSignin();
        err.code = "MFA_UNREADABLE";
        throw err;
      }
      if (!verifyToken(totpCode, secret)) {
        await recordAudit({
          action: AUDIT_ACTIONS.TOTP_VERIFY_FAILED,
          actor,
          resourceType: "user",
          resourceId: user.id,
        });
        return null;
      }
      await db
        .update(userTotp)
        .set({ lastUsedAt: new Date() })
        .where(eq(userTotp.userId, user.id));
      await recordAudit({
        action: AUDIT_ACTIONS.TOTP_VERIFY_SUCCEEDED,
        actor,
        resourceType: "user",
        resourceId: user.id,
      });
    } else {
      // Try as recovery code — ported logic from src/app/(auth)/totp/
      // actions.ts:137-178 via verify-recovery-code.ts (Phase 3 § 4).
      const result = await verifyRecoveryCode(db, user.id, totpCode);
      if (!result.ok) {
        await recordAudit({
          action: AUDIT_ACTIONS.TOTP_RECOVERY_FAILED,
          actor,
          resourceType: "user",
          resourceId: user.id,
          metadata: { reason: result.reason },
        });
        return null;
      }
      await recordAudit({
        action: AUDIT_ACTIONS.TOTP_RECOVERY_SUCCEEDED,
        actor,
        resourceType: "user",
        resourceId: user.id,
        metadata: { codeId: result.codeId },
      });
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    // Fixed at token-mint time (see jwt() below) — the signal that lets
    // jwt() treat this session's 2FA as already-cleared (or never owed)
    // rather than re-running the legacy /admin-scoped /totp gate a second
    // time on a code the user already gave. See jwt()'s own comment.
    atomicTotpEnabled: true,
  };
}

export const { handlers, auth, signIn, signOut, unstable_update } = createAuth({
  db,
  signInPage: "/signin",
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Google verifies email ownership at sign-in, so linking an existing
      // user record by email is safe with Google alone. If a fork adds a
      // second OAuth provider (GitHub, Microsoft, etc.) that does NOT verify
      // email, set this to `false` or the second provider can impersonate a
      // Google user by claiming their email.
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "Email + Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        // NextAuth 5 beta strips undeclared fields before authorize() is called.
        // type: "hidden" suppresses this field in any auto-generated sign-in form.
        turnstileToken: { label: "Turnstile Token", type: "hidden" },
        // Atomic-model field (2026-09-08 convergence) — absent/empty on the
        // first (credentials-only) submission, present on the resubmission
        // once TotpVerifyForm collects a code. Declaring it here is a no-op
        // on the legacy path (authorizeLegacy never reads it).
        totpCode: { label: "TOTP Code", type: "text" },
      },
      async authorize(credentials, request) {
        // Flag-gated dispatch — DECISION-021. `authorizeLegacy` is TODAY's
        // exact function body, unmodified, so "flag off = today's behavior,
        // byte-identical" is a property of the code SHAPE, not an assertion
        // about it. Row scoped app='portal' (not platform-wide) so
        // a predecessor app's/Admin's own future increments flip independently.
        const atomicEnabled = await isFlagEnabled(ATOMIC_TOTP_FLAG);
        if (!atomicEnabled) {
          return authorizeLegacy(credentials, request);
        }
        return authorizeAtomic(credentials, request);
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Delegate to the extracted gate so all branches are unit-testable.
      // See src/lib/auth/sign-in-gate.ts and DECISION-015 for rationale:
      //   - credentials → true unconditionally (authorize() already checked isActive)
      //   - OAuth, no row → true (adapter will create the user row after this)
      //   - OAuth, isActive=false → false (soft-deactivation block)
      //   - OAuth, no email → false (fail-safe)
      return evaluateSignIn(
        account?.provider ?? "credentials",
        user,
        (email) =>
          db.query.users
            .findFirst({
              where: eq(users.email, email),
              columns: { isActive: true },
            })
            .then((row) => row ?? null),
      );
    },
    // The `session` callback lives in the shared config (@repo/auth's
    // createAuthConfig, merged in by createAuth()) so the edge runtime
    // (proxy.ts) sees the same projection.
    async jwt({ token, user, trigger, session }) {
      // `user` is only present on the initial sign-in (Google callback or a
      // successful Credentials authorize). Subsequent requests carry the JWT
      // cookie only, so this block runs exactly once per session.
      if (user?.id) {
        token.sub = user.id;
        // Atomic-model signal (2026-09-08 convergence, DECISION-021):
        // authorizeAtomic() sets `atomicTotpEnabled: true` on the user
        // object it returns ONLY when it issued this session — which under
        // the atomic model means either a second factor was demanded and
        // validated inside authorize() (rows 1/3), or none was owed (rows
        // 2/4). Either way, nothing is left to verify. Threading that into
        // twoFactorVerified here (rather than the previous unconditional
        // `false`) stops the LEGACY /admin-scoped /totp gate
        // (two-factor-gate.ts's needsTwoFactorVerification, still active
        // and unmodified by this increment) from re-challenging a user for
        // a code they already gave. `authorizeLegacy` and Google OAuth
        // never set this field, so `atomicTotpEnabled` is `undefined` for
        // them and `twoFactorVerified` stays `false` — TODAY's exact
        // behavior, unchanged, for every path this increment doesn't touch.
        const atomicTotpEnabled =
          (user as { atomicTotpEnabled?: boolean }).atomicTotpEnabled === true;
        token.atomicTotpEnabled = atomicTotpEnabled;
        token.twoFactorVerified = atomicTotpEnabled;
        // Force a roles refresh on first sign-in. NextAuth's `createUser`
        // event runs fire-and-forget for OAuth users (the JWT callback can
        // race ahead of it), and Credentials sign-ins never fire it at all,
        // so we ensure the default role assignment + role load happen here
        // synchronously below.
        token.roles = undefined;
        await ensureDefaultRole(user.id, user.email ?? null);
        await db
          .update(users)
          .set({ lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null })
          .where(eq(users.id, user.id));
      }

      // Server-action-triggered updates (e.g. 2FA verified, role assigned)
      // call `unstable_update`; we merge the partial session payload back into
      // the token here so subsequent requests see the new state.
      if (trigger === "update" && session?.user) {
        if (typeof session.user.twoFactorVerified === "boolean") {
          token.twoFactorVerified = session.user.twoFactorVerified;
        }
        if (Array.isArray(session.user.roles)) {
          token.roles = session.user.roles;
        }
        if (Array.isArray(session.user.features)) {
          token.features = session.user.features;
        }
      }

      // Stale-JWT defense + role refresh.
      //
      // We hit the DB on every authenticated request to verify the user row
      // still exists and is active. That's one cheap SELECT, and it's the
      // only thing standing between a deleted/deactivated user and a still-
      // valid signed cookie. For role + feature changes to apply mid-session,
      // call `unstable_update({})` from the mutating action; this re-runs
      // the role lookup below.
      if (!token.sub) return token;

      const needsRoleRefresh = !token.roles || trigger === "update" || !!user;
      const claims = await computeSharedJwtClaims(db, token.sub, {
        featureKeys: FEATURE_KEYS,
        refreshRoles: needsRoleRefresh,
        // Revocation-freshness (DECISION-023) — a SECOND, independent
        // reason to refresh roles/features this request, additive to
        // needsRoleRefresh above. Rides the SELECT computeSharedJwtClaims
        // already issues unconditionally; adds zero queries here.
        currentRolesVersion: token.rolesVersion,
      });
      if (!claims) {
        // Row vanished or got deactivated. Returning an empty token signs
        // the user out on the next request.
        return {};
      }
      token.isActive = claims.isActive;
      // Effective twoFactorRequired: raw column value AND the org-level
      // auth.require_2fa master switch. Short-circuits when column is false
      // (no flag read needed). Falls back to raw column on DB error so a DB
      // blip does not accidentally ungate TOTP-required users. See DECISION-026.
      token.twoFactorRequired = await computeEffectiveTwoFactor(
        claims.twoFactorRequired,
      );
      if (claims.email) token.email = claims.email;
      // a predecessor app-shared claims (contract in @repo/auth's computeSharedJwtClaims
      // header) — no Portal runtime consumer today, but proxies/projections in
      // both apps expect them present on every token.
      token.mustChangePassword = claims.mustChangePassword;
      token.hasTotp = claims.hasTotp;
      // Unconditional every request, mirrors token.globalRole above —
      // DECISION-023. This is the value compared against on the NEXT
      // request's currentRolesVersion.
      token.rolesVersion = claims.rolesVersion;

      if (claims.roles) token.roles = claims.roles;
      if (claims.features) token.features = claims.features;
      return token;
    },
  },
});
