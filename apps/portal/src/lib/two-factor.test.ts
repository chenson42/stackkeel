import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateSecret, generateSync } from "otplib";

// two-factor.ts reads AUTH_TOTP_ENCRYPTION_KEY at call time (inside key()).
// Set it before importing the module so the key() helper can parse it.
// The value below is the one from .env.local — 32 bytes in base64.
const TEST_KEY = "u6VSNNy9Z10TKW/hmkR116uzLVf9XZvG7ZmUNyedLZI=";

beforeAll(() => {
  process.env.AUTH_TOTP_ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
});

import {
  encryptSecret,
  decryptSecret,
  TotpSecretUndecryptableError,
  generateSecret as tfGenerateSecret,
  verifyToken,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  otpauthUrl,
} from "./two-factor";

// ---------------------------------------------------------------------------
// encryptSecret / decryptSecret
// ---------------------------------------------------------------------------

describe("encryptSecret / decryptSecret", () => {
  it("round-trips plaintext through encrypt → decrypt", () => {
    // Arrange
    const plain = "JGVJ5L56S4ACYFDLCTHVUSO3WESDOCGV";

    // Act
    const ciphertext = encryptSecret(plain);
    const recovered = decryptSecret(ciphertext);

    // Assert
    expect(recovered).toBe(plain);
  });

  it("each encrypt call produces a unique ciphertext (unique IV per call)", () => {
    // Arrange
    const plain = "SAMESECRETEVERYIME";

    // Act
    const ct1 = encryptSecret(plain);
    const ct2 = encryptSecret(plain);

    // Assert — different IVs → different outputs, even for the same plaintext
    expect(ct1).not.toBe(ct2);
  });

  it("both unique ciphertexts decrypt to the same plaintext", () => {
    // Arrange
    const plain = "SAMESECRETEVERYIME";
    const ct1 = encryptSecret(plain);
    const ct2 = encryptSecret(plain);

    // Act + Assert
    expect(decryptSecret(ct1)).toBe(plain);
    expect(decryptSecret(ct2)).toBe(plain);
  });

  it("decryptSecret throws when the ciphertext is tampered (auth tag mismatch)", () => {
    // Arrange
    const ct = encryptSecret("mysecret");
    // Flip a byte in the middle of the base64-decoded buffer (the ciphertext
    // body starts at byte 28; the auth tag occupies bytes 12–27).
    const buf = Buffer.from(ct, "base64");
    buf[30] ^= 0xff; // corrupt a ciphertext byte
    const tampered = buf.toString("base64");

    // Act + Assert
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("decryptSecret throws when AUTH_TOTP_ENCRYPTION_KEY is missing", () => {
    // Arrange — temporarily remove the key
    const saved = process.env.AUTH_TOTP_ENCRYPTION_KEY;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;

    // Act + Assert
    expect(() => decryptSecret("anything")).toThrow(
      "AUTH_TOTP_ENCRYPTION_KEY is not set",
    );

    // Teardown
    process.env.AUTH_TOTP_ENCRYPTION_KEY = saved;
  });

  it("decryptSecret throws when the key decodes to the wrong byte length", () => {
    // Arrange — a base64 string that decodes to 16 bytes (not 32)
    const saved = process.env.AUTH_TOTP_ENCRYPTION_KEY;
    process.env.AUTH_TOTP_ENCRYPTION_KEY =
      Buffer.alloc(16).toString("base64"); // 16 bytes, not 32

    // Act + Assert
    expect(() => decryptSecret("anything")).toThrow(
      "AUTH_TOTP_ENCRYPTION_KEY must decode to 32 bytes",
    );

    // Teardown
    process.env.AUTH_TOTP_ENCRYPTION_KEY = saved;
  });

  it("encryptSecret throws when AUTH_TOTP_ENCRYPTION_KEY is missing", () => {
    // Arrange
    const saved = process.env.AUTH_TOTP_ENCRYPTION_KEY;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;

    // Act + Assert
    expect(() => encryptSecret("mysecret")).toThrow(
      "AUTH_TOTP_ENCRYPTION_KEY is not set",
    );

    // Teardown
    process.env.AUTH_TOTP_ENCRYPTION_KEY = saved;
  });
});

// ---------------------------------------------------------------------------
// generateSecret
// ---------------------------------------------------------------------------

describe("generateSecret", () => {
  it("returns a non-empty base32 string", () => {
    // Act
    const secret = tfGenerateSecret();

    // Assert
    expect(typeof secret).toBe("string");
    expect(secret.length).toBeGreaterThan(0);
    // Base32 alphabet: A-Z and 2-7, optionally padded with =
    expect(/^[A-Z2-7]+=*$/.test(secret)).toBe(true);
  });

  it("returns a different value on each call (random)", () => {
    // Act
    const s1 = tfGenerateSecret();
    const s2 = tfGenerateSecret();

    // Assert
    expect(s1).not.toBe(s2);
  });
});

// ---------------------------------------------------------------------------
// verifyToken
// ---------------------------------------------------------------------------

describe("verifyToken", () => {
  it("accepts a valid TOTP code generated at the current time", () => {
    // Arrange
    const secret = generateSecret();
    // generateSync({ secret, type: "totp" }) from the otplib top-level API
    // produces the current 6-digit code for this secret.
    const code = generateSync({ secret });

    // Act
    const result = verifyToken(code, secret);

    // Assert
    expect(result).toBe(true);
  });

  it("rejects a totally wrong code", () => {
    // Arrange
    const secret = generateSecret();

    // Act
    const result = verifyToken("000000", secret);

    // Assert — vanishingly unlikely that 000000 is the real code
    // (probability 1/1 000 000); acceptable for a deterministic-enough test
    expect(result).toBe(false);
  });

  it("rejects an expired code from a time step more than 30 s in the past", () => {
    // Arrange — generate a code for a time step 90 seconds ago
    const secret = generateSecret();
    const pastEpoch = Math.floor((Date.now() - 90_000) / 1000);
    const expiredCode = generateSync({ secret, epoch: pastEpoch });

    // Act — verifyToken uses epochTolerance: [30, 0], so a code from 90 s
    // ago (3 full steps back) must be rejected.
    const result = verifyToken(expiredCode, secret);

    // Assert
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// otpauthUrl
// ---------------------------------------------------------------------------

describe("otpauthUrl", () => {
  it("returns a string starting with otpauth://totp/", () => {
    // Arrange
    const secret = generateSecret();

    // Act
    const url = otpauthUrl("user@example.com", secret);

    // Assert
    expect(url).toMatch(/^otpauth:\/\/totp\//);
  });

  it("includes the issuer and email in the URL", () => {
    // Arrange
    const secret = generateSecret();

    // Act
    const url = otpauthUrl("user@example.com", secret, "MyApp");

    // Assert
    expect(url).toContain("MyApp");
    expect(url).toContain("user%40example.com");
  });

  it("uses the default issuer when none is provided", () => {
    // Arrange
    const secret = generateSecret();

    // Act
    const url = otpauthUrl("user@example.com", secret);

    // Assert
    expect(url).toContain("issuer=APP");
  });
});

// ---------------------------------------------------------------------------
// generateRecoveryCodes
// ---------------------------------------------------------------------------

describe("generateRecoveryCodes", () => {
  it("returns exactly 10 codes", () => {
    // Act
    const codes = generateRecoveryCodes();

    // Assert
    expect(codes).toHaveLength(10);
  });

  it("each code matches the XXXX-XXXX format", () => {
    // Act
    const codes = generateRecoveryCodes();

    // Assert — alphabet: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no 0/O/1/I)
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
  });

  it("produces unique codes across one generation", () => {
    // Act
    const codes = generateRecoveryCodes();

    // Assert
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("two calls produce different sets (random)", () => {
    // Act
    const set1 = generateRecoveryCodes();
    const set2 = generateRecoveryCodes();

    // Assert — at least one code should differ between sets
    expect(set1.join(",")).not.toBe(set2.join(","));
  });
});

// ---------------------------------------------------------------------------
// hashRecoveryCode
// ---------------------------------------------------------------------------

describe("hashRecoveryCode", () => {
  it("returns a 64-character hex string (SHA-256)", () => {
    // Act
    const hash = hashRecoveryCode("ABCD-EFGH");

    // Assert
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it("is deterministic — same input always yields the same hash", () => {
    // Act
    const h1 = hashRecoveryCode("ABCD-EFGH");
    const h2 = hashRecoveryCode("ABCD-EFGH");

    // Assert
    expect(h1).toBe(h2);
  });

  it("normalises input — lowercase and leading/trailing whitespace produce the same hash", () => {
    // Act
    const h1 = hashRecoveryCode("abcd-efgh");
    const h2 = hashRecoveryCode("  ABCD-EFGH  ");

    // Assert
    expect(h1).toBe(h2);
  });

  it("two different codes produce different hashes", () => {
    // Act
    const h1 = hashRecoveryCode("ABCD-EFGH");
    const h2 = hashRecoveryCode("WXYZ-1234");

    // Assert
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// normalizeRecoveryCode
// ---------------------------------------------------------------------------

describe("normalizeRecoveryCode", () => {
  it("returns a correctly formatted 9-char code unchanged (already canonical)", () => {
    // Act
    const result = normalizeRecoveryCode("ABCD-EFGH");

    // Assert
    expect(result).toBe("ABCD-EFGH");
  });

  it("inserts a dash for an 8-char code without a dash", () => {
    // Act
    const result = normalizeRecoveryCode("ABCDEFGH");

    // Assert
    expect(result).toBe("ABCD-EFGH");
  });

  it("uppercases lowercase input", () => {
    // Act
    const result = normalizeRecoveryCode("abcd-efgh");

    // Assert
    expect(result).toBe("ABCD-EFGH");
  });

  it("strips surrounding whitespace", () => {
    // Act
    const result = normalizeRecoveryCode("  ABCD-EFGH  ");

    // Assert
    expect(result).toBe("ABCD-EFGH");
  });

  it("returns null for a code that is too short", () => {
    // Act
    const result = normalizeRecoveryCode("ABC");

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for a code that is too long", () => {
    // Act
    const result = normalizeRecoveryCode("ABCDEFGHIJKLMN");

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for an empty string", () => {
    // Act
    const result = normalizeRecoveryCode("");

    // Assert
    expect(result).toBeNull();
  });
});

/**
 * Regression tests for the 2026-09-06 staging incident: AUTH_TOTP_ENCRYPTION_KEY
 * was rotated while users held live enrolments, and the next deployment to pick
 * up the new key could no longer read their secrets. Node surfaces that as
 * `Error: Unsupported state or unable to authenticate data`, which reached the
 * user as a bare 500 "This page couldn't load".
 *
 * These pin the typed error that lets every call site tell "this enrolment must
 * be re-established" apart from a genuine fault.
 */
describe("TotpSecretUndecryptableError", () => {
  const OTHER_KEY = "Ao3nD1u1sK4xN0pQ7rT2vW5yZ8aB1cD4eF7gH0iJ3kM=";

  it("is thrown when the ciphertext was encrypted under a different key", () => {
    const ciphertext = encryptSecret("JBSWY3DPEHPK3PXP");

    const saved = process.env.AUTH_TOTP_ENCRYPTION_KEY;
    process.env.AUTH_TOTP_ENCRYPTION_KEY = OTHER_KEY;
    try {
      expect(() => decryptSecret(ciphertext)).toThrow(
        TotpSecretUndecryptableError,
      );
    } finally {
      process.env.AUTH_TOTP_ENCRYPTION_KEY = saved;
    }
  });

  it("is thrown for a corrupted/truncated ciphertext, not just a wrong key", () => {
    expect(() => decryptSecret("bm90LXJlYWwtY2lwaGVydGV4dA==")).toThrow(
      TotpSecretUndecryptableError,
    );
  });

  it("carries the underlying crypto error as `cause` for server-side diagnosis", () => {
    try {
      decryptSecret("bm90LXJlYWwtY2lwaGVydGV4dA==");
      throw new Error("expected decryptSecret to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TotpSecretUndecryptableError);
      expect((err as TotpSecretUndecryptableError).cause).toBeInstanceOf(Error);
    }
  });

  it("does NOT mask a missing key — that is a deployment fault, not a stale enrolment", () => {
    // Reporting "re-enrol your 2FA" to every user when the key is simply absent
    // would send all of them chasing a fix none of them can make.
    const ciphertext = encryptSecret("JBSWY3DPEHPK3PXP");
    const saved = process.env.AUTH_TOTP_ENCRYPTION_KEY;
    delete process.env.AUTH_TOTP_ENCRYPTION_KEY;
    try {
      expect(() => decryptSecret(ciphertext)).toThrow(
        "AUTH_TOTP_ENCRYPTION_KEY is not set",
      );
      expect(() => decryptSecret(ciphertext)).not.toThrow(
        TotpSecretUndecryptableError,
      );
    } finally {
      process.env.AUTH_TOTP_ENCRYPTION_KEY = saved;
    }
  });

  it("does NOT mask a malformed key, for the same reason", () => {
    const ciphertext = encryptSecret("JBSWY3DPEHPK3PXP");
    const saved = process.env.AUTH_TOTP_ENCRYPTION_KEY;
    process.env.AUTH_TOTP_ENCRYPTION_KEY = "dG9vLXNob3J0";
    try {
      expect(() => decryptSecret(ciphertext)).toThrow(
        "AUTH_TOTP_ENCRYPTION_KEY must decode to 32 bytes",
      );
    } finally {
      process.env.AUTH_TOTP_ENCRYPTION_KEY = saved;
    }
  });

  it("still round-trips normally under the correct key", () => {
    expect(decryptSecret(encryptSecret("JBSWY3DPEHPK3PXP"))).toBe(
      "JBSWY3DPEHPK3PXP",
    );
  });
});
