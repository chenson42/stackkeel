import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import {
  encryptSecret,
  decryptSecret,
  generateSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  otpauthUrl,
  verifyToken,
  TotpSecretUndecryptableError,
} from "./two-factor";

beforeAll(() => {
  process.env.AUTH_TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("secret encryption", () => {
  it("round-trips a secret through AES-256-GCM", () => {
    const secret = generateSecret();
    const ciphertext = encryptSecret(secret);
    expect(ciphertext).not.toContain(secret);
    expect(decryptSecret(ciphertext)).toBe(secret);
  });

  it("throws TotpSecretUndecryptableError for a ciphertext under a rotated key", () => {
    const ciphertext = encryptSecret("JBSWY3DPEHPK3PXP");
    process.env.AUTH_TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptSecret(ciphertext)).toThrow(TotpSecretUndecryptableError);
  });

  it("throws TotpSecretUndecryptableError for truncated/garbage input", () => {
    expect(() => decryptSecret("bm90LXJlYWw=")).toThrow(TotpSecretUndecryptableError);
  });

  it("surfaces a missing/short key as a deployment fault, not a user fault", () => {
    const prior = process.env.AUTH_TOTP_ENCRYPTION_KEY;
    process.env.AUTH_TOTP_ENCRYPTION_KEY = Buffer.from("short").toString("base64");
    expect(() => encryptSecret("X")).toThrow(/32 bytes/);
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    expect(() => encryptSecret("X")).toThrow(/not set/);
    process.env.AUTH_TOTP_ENCRYPTION_KEY = prior;
  });
});

describe("otpauth URL", () => {
  it("embeds issuer and label", () => {
    const uri = otpauthUrl("user@example.com", "JBSWY3DPEHPK3PXP", "MYAPP");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("MYAPP");
    expect(uri).toContain(encodeURIComponent("user@example.com"));
  });
});

describe("verifyToken", () => {
  it("rejects an obviously wrong token", () => {
    expect(verifyToken("000000", generateSecret())).toBe(false);
  });
});

describe("recovery codes", () => {
  it("generates 10 codes shaped XXXX-XXXX from the confusion-free alphabet", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    for (const code of codes) {
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
  });

  it("normalize is case/whitespace/hyphen tolerant and hash is stable", () => {
    expect(normalizeRecoveryCode(" abcd-efgh ")).toBe("ABCD-EFGH");
    expect(normalizeRecoveryCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(normalizeRecoveryCode("not a code!!")).toBeNull();
    expect(hashRecoveryCode("abcd-efgh")).toBe(hashRecoveryCode("ABCD-EFGH"));
  });
});
