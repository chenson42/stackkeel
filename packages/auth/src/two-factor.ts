// packages/auth/src/two-factor.ts
//
// TOTP encrypt/verify + recovery-code utilities as plain exported functions
// — each app's own authorize()/enrollment flow calls these directly rather
// than sharing one authorize() implementation (the control-flow shapes stay
// separate per app; see post-signin.ts's header for why).

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  generateSecret as otpGenerateSecret,
  generateURI,
  verifySync,
} from "otplib";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const k = process.env.AUTH_TOTP_ENCRYPTION_KEY;
  if (!k) throw new Error("AUTH_TOTP_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) {
    throw new Error("AUTH_TOTP_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * A stored TOTP secret could not be decrypted with the current
 * AUTH_TOTP_ENCRYPTION_KEY.
 *
 * This is a NORMAL, expected operational state, not a programming error: it is
 * what every enrolled user's row looks like after the key is rotated (see the
 * "TOTP Encryption Key" invariant in AGENTS.md — rotating it invalidates every
 * enrolled secret in the database). This has happened for real: a key was
 * rotated while users held live enrollments, and the next deployment to
 * pick up the new key could no longer read their secrets.
 *
 * Node reports this as `Error: Unsupported state or unable to authenticate
 * data` from the AES-GCM auth-tag check — a message that says nothing about
 * TOTP, keys, or what a person should do next, and which reached the user as a
 * bare 500 "This page couldn't load". Callers catch THIS type instead so they
 * can tell "your 2FA needs re-enrolling" apart from a genuine fault, and say
 * so.
 *
 * Distinguishing it matters for a second reason: a *pending* enrolment that
 * cannot be decrypted is safely discardable — nothing depends on it yet, so
 * the right response is to silently regenerate rather than to fail at all.
 * Only a *confirmed* enrolment needs a human in the loop.
 */
export class TotpSecretUndecryptableError extends Error {
  readonly cause?: unknown;

  constructor(cause?: unknown) {
    super(
      "Stored TOTP secret could not be decrypted with the current AUTH_TOTP_ENCRYPTION_KEY",
    );
    this.name = "TotpSecretUndecryptableError";
    this.cause = cause;
  }
}

export function decryptSecret(ciphertext: string): string {
  // Deliberately wraps malformed-input and auth-tag failures alike. A row whose
  // base64 is truncated is no more recoverable than one encrypted under a
  // retired key, and both mean the same thing to a caller: this enrolment can
  // no longer be read and must be re-established.
  try {
    const buf = Buffer.from(ciphertext, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      "utf8",
    );
  } catch (err) {
    // A misconfigured/absent key is a DEPLOYMENT fault affecting every user,
    // not one person's stale enrolment — it must keep surfacing as itself
    // rather than being reported to users as "re-enrol your 2FA", which would
    // send everyone chasing a fix they cannot make.
    if (
      err instanceof Error &&
      err.message.startsWith("AUTH_TOTP_ENCRYPTION_KEY")
    ) {
      throw err;
    }
    throw new TotpSecretUndecryptableError(err);
  }
}

export function generateSecret(): string {
  return otpGenerateSecret();
}

export function otpauthUrl(
  email: string,
  secret: string,
  issuer = "APP",
): string {
  return generateURI({ issuer, label: email, secret });
}

export function verifyToken(token: string, secret: string): boolean {
  // RFC 6238 recommends a small backward tolerance to handle clock drift
  // between the server and the user's authenticator. `[30, 0]` (seconds)
  // accepts the previous 30-second step but no future steps.
  return verifySync({ secret, token, epochTolerance: [30, 0] }).valid;
}

// -----------------------------------------------------------------------------
// Recovery codes
//
// Format: 10 codes, each `XXXX-XXXX` (8 alphanumeric chars + a dash for
// readability). Hashed with SHA-256 (codes are high-entropy and single-use,
// so a slow hash like bcrypt would buy nothing). The plaintext set is only
// shown once via the FRESH_RECOVERY_CODES_COOKIE handoff.
// -----------------------------------------------------------------------------

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export const FRESH_RECOVERY_CODES_COOKIE = "fresh_recovery_codes";

export function generateRecoveryCodes(): string[] {
  const out: string[] = [];
  while (out.length < RECOVERY_CODE_COUNT) {
    const bytes = randomBytes(8);
    let s = "";
    for (let i = 0; i < 8; i++) {
      s += RECOVERY_CODE_ALPHABET[bytes[i] % RECOVERY_CODE_ALPHABET.length];
    }
    out.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return out;
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function normalizeRecoveryCode(input: string): string | null {
  const trimmed = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9-]{8,10}$/.test(trimmed)) return null;
  if (trimmed.length === 8) return `${trimmed.slice(0, 4)}-${trimmed.slice(4)}`;
  return trimmed;
}
