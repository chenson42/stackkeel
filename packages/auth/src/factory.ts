import NextAuth, { type NextAuthConfig } from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { Db, IdentitySchema } from "@repo/db";
import { users, accounts, sessions, verificationTokens } from "@repo/db";
import { createAuthConfig } from "./config";

/**
 * Node-side NextAuth factory. Each app calls this with its own `db`
 * instance, sign-in page, provider list, and callback overrides — the
 * providers' `authorize()` bodies and the `jwt` callback's app-specific
 * logic stay in each app's own `src/auth.ts`. Apps keep genuinely different
 * sign-in control flows, so this is NOT a shared `authorize()` — just the
 * shared adapter wiring + edge-safe base config.
 *
 * `callbacks` is merged on top of the edge-safe base's `session`/`authorized`
 * callbacks (so both keep working via `createAuthConfig`) — an app-supplied
 * `session`/`authorized` override would take precedence if provided, but
 * neither app needs to override those today.
 *
 * Generic over `TSchema` (constrained to, and defaulting to, the
 * identity-only schema) so an app can pass its own `db` parameterized over
 * a wider merged schema (identity tables + its own domain tables +
 * `relations()`) — see @repo/db's `IdentitySchema` export for why this
 * can't just be `Db` (non-generic).
 */
export function createAuth<TSchema extends IdentitySchema = IdentitySchema>(opts: {
  db: Db<TSchema>;
  signInPage: string;
  providers: NextAuthConfig["providers"];
  callbacks?: NextAuthConfig["callbacks"];
  /**
   * Forwarded straight into the shared `createAuthConfig()` call below, so
   * the node-side instance and any edge-safe instance built from the same
   * params produce byte-identical `session.maxAge` + `cookies`. Sourced
   * from `AUTH_COOKIE_DOMAIN` / `SESSION_MAX_AGE_SECONDS` when omitted —
   * see `./cookies`.
   */
  cookieDomain?: string;
  sessionMaxAge?: number;
  /**
   * Escape hatches for callers that need to deviate from the shared
   * cookie/session config entirely. Take precedence over the shared config
   * when provided; prefer `cookieDomain`/`sessionMaxAge` above.
   */
  session?: NextAuthConfig["session"];
  cookies?: NextAuthConfig["cookies"];
}) {
  const base = createAuthConfig({
    signInPage: opts.signInPage,
    cookieDomain: opts.cookieDomain,
    sessionMaxAge: opts.sessionMaxAge,
  });
  return NextAuth({
    ...base,
    ...(opts.session ? { session: opts.session } : {}),
    ...(opts.cookies ? { cookies: opts.cookies } : {}),
    adapter: DrizzleAdapter(opts.db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    providers: opts.providers,
    callbacks: {
      ...base.callbacks,
      ...opts.callbacks,
    },
  });
}
