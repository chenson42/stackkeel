import "server-only";

/**
 * Shared pending-TOTP-enrollment helpers.
 *
 * `db`-injected, not a self-contained module — same DI shape as
 * `./factory.ts`'s createAuth. All three functions are generic
 * (`<TSchema extends IdentitySchema = IdentitySchema>(db: Db<TSchema>, ...)`)
 * so every app's own `db` — including one parameterized over a wider merged
 * schema with its own `relations()` — satisfies the parameter with no cast.
 * Reads use the core query builder (`db.select().from(...)`) rather than
 * `db.query.*`: the relational API is keyed off the SPECIFIC TSchema type
 * parameter and cannot be resolved while TSchema is still generic.
 *
 * `issuer` is optional and passed straight through to `otpauthUrl`, whose
 * own parameter defaults to "APP" — pass your app's short name.
 *
 * `import "server-only"`: this module is DB-touching and lives in a package
 * apps' proxy.ts files import subpaths from (`@repo/auth/post-signin`) —
 * exactly the shape of file the "no app's proxy can import a DB client"
 * invariant (AGENTS.md § Key Invariants) exists to guard by construction.
 *
 * Exported via the dedicated `./totp-pending` subpath in package.json's
 * `exports` map — NEVER added to `src/index.ts`'s barrel. The barrel
 * re-exports `./factory`, which does a real top-level `import NextAuth from
 * "next-auth"`; a DB-touching module in the barrel would force every unit
 * test that imports any barrel export to carry that import graph.
 */

import { eq } from "drizzle-orm";
import type { Db, IdentitySchema } from "@repo/db";
import { userTotpPendingEnrollments } from "@repo/db";
import {
  decryptSecret,
  encryptSecret,
  generateSecret,
  otpauthUrl,
  TotpSecretUndecryptableError,
} from "./two-factor";

export const PENDING_TTL_MINUTES = 10;

export interface PendingEnrollmentResult {
  /** Base-32 plaintext secret — shown once for manual entry. */
  secret: string;
  /** otpauth:// URI used to render the QR code. */
  uri: string;
}

/**
 * Returns the active pending enrollment for `userId`, creating (or
 * replacing an expired) pending row when necessary. Reusing a still-valid
 * row keeps the QR code stable across page reloads within the TTL window,
 * so the user's authenticator app stays in sync.
 */
export async function getOrCreatePendingEnrollment<TSchema extends IdentitySchema = IdentitySchema>(
  db: Db<TSchema>,
  userId: string,
  email: string,
  issuer?: string,
): Promise<PendingEnrollmentResult> {
  const [existing] = await db
    .select()
    .from(userTotpPendingEnrollments)
    .where(eq(userTotpPendingEnrollments.userId, userId))
    .limit(1);

  if (existing && existing.expiresAt > new Date()) {
    // An unreadable PENDING secret is safely discardable: enrollment is not
    // confirmed yet, so nothing depends on this row and no authenticator has
    // been set up against it. Falling through regenerates one transparently.
    //
    // This path is load-bearing after a key rotation. It is the route a user
    // takes to RE-ENROLL once their confirmed secret has been invalidated —
    // so letting an undecryptable pending row throw here would lock them out
    // of the one screen that could fix them.
    try {
      const secret = decryptSecret(existing.secretCiphertext);
      const uri = otpauthUrl(email, secret, issuer);
      return { secret, uri };
    } catch (err) {
      if (!(err instanceof TotpSecretUndecryptableError)) throw err;
    }
  }

  const secret = generateSecret();
  const ciphertext = encryptSecret(secret);
  const expiresAt = new Date(Date.now() + PENDING_TTL_MINUTES * 60 * 1000);

  await db
    .insert(userTotpPendingEnrollments)
    .values({ userId, secretCiphertext: ciphertext, expiresAt })
    .onConflictDoUpdate({
      target: userTotpPendingEnrollments.userId,
      set: { secretCiphertext: ciphertext, expiresAt, createdAt: new Date() },
    });

  const uri = otpauthUrl(email, secret, issuer);
  return { secret, uri };
}

/**
 * Reads the live, unexpired pending secret for a user, or null. Used by
 * every app's completion step to validate the submitted code against the
 * secret the SERVER issued — never one supplied by the client.
 */
export async function getPendingSecret<TSchema extends IdentitySchema = IdentitySchema>(
  db: Db<TSchema>,
  userId: string,
): Promise<string | null> {
  const [existing] = await db
    .select()
    .from(userTotpPendingEnrollments)
    .where(eq(userTotpPendingEnrollments.userId, userId))
    .limit(1);
  if (!existing || existing.expiresAt <= new Date()) return null;
  try {
    return decryptSecret(existing.secretCiphertext);
  } catch (err) {
    if (!(err instanceof TotpSecretUndecryptableError)) throw err;
    // Same meaning to every caller as an expired or absent row: there is no
    // usable pending secret. Callers already handle null by rejecting the
    // submitted code, so this degrades to a normal failed verification
    // rather than a 500 — and getOrCreatePendingEnrollment() above will mint
    // a fresh one on the next visit to the setup page.
    return null;
  }
}

/** Clears the pending row once enrollment is confirmed (or abandoned). */
export async function clearPendingEnrollment<TSchema extends IdentitySchema = IdentitySchema>(
  db: Db<TSchema>,
  userId: string,
): Promise<void> {
  await db
    .delete(userTotpPendingEnrollments)
    .where(eq(userTotpPendingEnrollments.userId, userId));
}
