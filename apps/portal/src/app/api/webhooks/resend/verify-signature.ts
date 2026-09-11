import crypto from "node:crypto";

/**
 * Verify a Resend/Svix webhook signature.
 *
 * SIGNATURE VERIFICATION: hand-rolled per DECISION-028 / Phase 2 Ruling 2.
 * Three hard requirements per the architect's mandate:
 *   §1 crypto.timingSafeEqual() — never === on HMAC bytes.
 *   §2 ±300s replay window — explicit timestamp check; NOT implicit in HMAC.
 *   §3 Multi-sig parsing — svix-signature may carry multiple v1, entries.
 *
 * If any requirement cannot be cleanly met in future maintenance, replace this
 * module with: import { Webhook } from "svix" and delegate to the svix package.
 * No additional DECISION is required — document the reason in that comment.
 *
 * @param svixId        Value of the svix-id request header.
 * @param svixTimestamp Value of the svix-timestamp request header (Unix seconds).
 * @param svixSignature Value of the svix-signature request header (space-separated
 *                      "v1,<base64>" entries; may contain multiple for key rotation).
 * @param rawBody       The raw UTF-8 request body as text (MUST be read before
 *                      any JSON parse — req.json() consumes the stream).
 * @param secret        The RESEND_WEBHOOK_SECRET env var value (may be prefixed
 *                      with "whsec_"; the prefix is stripped before decoding).
 * @returns true if at least one signature entry validates; false otherwise.
 */
export function verifyResendSignature(
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  rawBody: string,
  secret: string,
): boolean {
  // §2 Replay window: reject events outside ±300s of server clock.
  // parseInt with radix 10; NaN → Math.abs(NaN) = NaN → NaN > 300 = false,
  // so !Number.isFinite guard is required to catch malformed timestamps.
  const ts = parseInt(svixTimestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return false;
  }

  // Compute HMAC-SHA256 over "${svixId}.${svixTimestamp}.${rawBody}".
  // Strip optional "whsec_" prefix before base64-decoding to the signing key.
  const signingKey = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signInput = `${svixId}.${svixTimestamp}.${rawBody}`;
  const computedHmac = crypto
    .createHmac("sha256", signingKey)
    .update(signInput)
    .digest();

  // §3 Multi-sig: split on space, keep only "v1," prefixed entries.
  // An empty list means the header is malformed — return false immediately.
  const v1Entries = svixSignature
    .split(" ")
    .filter((entry) => entry.startsWith("v1,"));

  if (v1Entries.length === 0) return false;

  for (const entry of v1Entries) {
    const sigBytes = Buffer.from(entry.slice(3), "base64");
    // Length guard prevents timingSafeEqual throwing on mismatched buffers.
    if (sigBytes.length !== computedHmac.length) continue;
    // §1 Timing-safe comparison — never use === on crypto buffers.
    if (crypto.timingSafeEqual(computedHmac, sigBytes)) return true;
  }

  return false;
}
