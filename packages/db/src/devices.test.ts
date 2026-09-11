import { describe, it, expect } from "vitest";
import {
  authenticateDeviceToken,
  consumePairingCode,
  extractBearerToken,
  hashDeviceSecret,
  isDevicePlatform,
  mintDeviceToken,
  mintPairingCode,
  platformLabel,
  verifyDeviceSecretHash,
  PAIRING_CODE_TTL_MS,
} from "./devices";

describe("token mint/hash/verify (pure)", () => {
  it("mints a base64url token whose hash round-trips", () => {
    const { raw, hash } = mintDeviceToken();
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    expect(hash).toBe(hashDeviceSecret(raw));
    expect(verifyDeviceSecretHash(raw, hash)).toBe(true);
  });

  it("rejects a wrong token against a stored hash", () => {
    const { hash } = mintDeviceToken();
    expect(verifyDeviceSecretHash("not-the-token", hash)).toBe(false);
    // Different-length buffers must return false, not throw (timingSafeEqual
    // throws on length mismatch — the helper guards it).
    expect(verifyDeviceSecretHash("short", "abcd")).toBe(false);
  });

  it("mints 6-digit pairing codes, leading zeros allowed", () => {
    for (let i = 0; i < 25; i++) {
      const { raw, hash } = mintPairingCode();
      expect(raw).toMatch(/^\d{6}$/);
      expect(hash).toBe(hashDeviceSecret(raw));
    }
    expect(PAIRING_CODE_TTL_MS).toBe(600_000);
  });
});

describe("extractBearerToken", () => {
  it("extracts a well-formed bearer token case-insensitively", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
    expect(extractBearerToken("bearer abc123")).toBe("abc123");
    expect(extractBearerToken("  Bearer   abc123  ".replace(/\s+/g, " "))).toBe("abc123");
  });

  it("returns null for missing, malformed, or empty headers", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer a b")).toBeNull();
  });
});

describe("isDevicePlatform / platformLabel", () => {
  it("accepts only ios|android", () => {
    expect(isDevicePlatform("ios")).toBe(true);
    expect(isDevicePlatform("android")).toBe(true);
    expect(isDevicePlatform("web")).toBe(false);
    expect(isDevicePlatform(null)).toBe(false);
  });
  it("labels platforms and passes unknowns through", () => {
    expect(platformLabel("ios")).toBe("iOS");
    expect(platformLabel("android")).toBe("Android");
    expect(platformLabel("web")).toBe("web");
  });
});

// ---------------------------------------------------------------------------
// authenticateDeviceToken — select-chain stub
// ---------------------------------------------------------------------------

function makeSelectStub(row: Record<string, unknown> | undefined) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (row ? [row] : []) }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("authenticateDeviceToken", () => {
  const minted = mintDeviceToken();
  const baseRow = {
    id: "d1",
    userId: "u1",
    platform: "ios",
    name: "Test iPhone",
    tokenHash: minted.hash,
    revokedAt: null,
  };

  it("authenticates a valid, unrevoked token", async () => {
    const result = await authenticateDeviceToken(
      makeSelectStub(baseRow),
      `Bearer ${minted.raw}`,
    );
    expect(result).toEqual({
      kind: "ok",
      device: { id: "d1", userId: "u1", platform: "ios", name: "Test iPhone" },
    });
  });

  it("distinguishes revoked from unauthorized", async () => {
    const revoked = { ...baseRow, revokedAt: new Date() };
    const result = await authenticateDeviceToken(
      makeSelectStub(revoked),
      `Bearer ${minted.raw}`,
    );
    expect(result).toEqual({ kind: "revoked" });
  });

  it("returns unauthorized for missing header, unknown token, or hash mismatch", async () => {
    expect(await authenticateDeviceToken(makeSelectStub(baseRow), null)).toEqual({
      kind: "unauthorized",
    });
    expect(
      await authenticateDeviceToken(makeSelectStub(undefined), `Bearer ${minted.raw}`),
    ).toEqual({ kind: "unauthorized" });
    const tampered = { ...baseRow, tokenHash: hashDeviceSecret("different") };
    expect(
      await authenticateDeviceToken(makeSelectStub(tampered), `Bearer ${minted.raw}`),
    ).toEqual({ kind: "unauthorized" });
  });
});

// ---------------------------------------------------------------------------
// consumePairingCode — update-chain stub
// ---------------------------------------------------------------------------

function makeUpdateStub(
  returned: Array<{ userId: string; expiresAt: Date }>,
  capture?: { where?: unknown },
) {
  return {
    update: () => ({
      set: () => ({
        where: (w: unknown) => {
          if (capture) capture.where = w;
          return { returning: async () => returned };
        },
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("consumePairingCode", () => {
  const now = new Date("2026-09-11T12:00:00Z");

  it("rejects non-6-digit input without touching the db", async () => {
    let touched = false;
    const db = {
      update: () => {
        touched = true;
        throw new Error("should not be called");
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(await consumePairingCode(db, "12345", now)).toEqual({ kind: "invalid_code" });
    expect(await consumePairingCode(db, "abcdef", now)).toEqual({ kind: "invalid_code" });
    expect(touched).toBe(false);
  });

  it("consumes a valid, unexpired code", async () => {
    const db = makeUpdateStub([
      { userId: "u1", expiresAt: new Date(now.getTime() + 60_000) },
    ]);
    expect(await consumePairingCode(db, "012345", now)).toEqual({
      kind: "ok",
      userId: "u1",
    });
  });

  it("rejects an expired code (and the consume-write burns it)", async () => {
    const db = makeUpdateStub([
      { userId: "u1", expiresAt: new Date(now.getTime() - 1000) },
    ]);
    expect(await consumePairingCode(db, "012345", now)).toEqual({ kind: "invalid_code" });
  });

  it("rejects when no unconsumed row matches (already used or never existed)", async () => {
    expect(await consumePairingCode(makeUpdateStub([]), "012345", now)).toEqual({
      kind: "invalid_code",
    });
  });
});
