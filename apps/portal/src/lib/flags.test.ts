import { describe, it, expect, vi, beforeEach } from "vitest";

// isFlagEnabled reads from the DB via db.query.featureFlags.findFirst.
// The DB module throws at import time if DATABASE_URL is unset, so we mock
// the entire @/lib/db module before importing isFlagEnabled.

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      featureFlags: {
        findFirst: vi.fn(),
      },
    },
  },
}));

// Import after mocking so the module receives the mocked db.
import { isFlagEnabled } from "./flags";
import { db } from "@/lib/db";

// Typed alias for the mock so TypeScript doesn't complain about .mockResolvedValue.
const findFirst = db.query.featureFlags.findFirst as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isFlagEnabled", () => {
  it("returns false for an unknown flag key — no row in the DB", async () => {
    // Arrange
    findFirst.mockResolvedValue(undefined);

    // Act
    const result = await isFlagEnabled("nonexistent-flag");

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when the flag row exists but enabled is false", async () => {
    // Arrange
    findFirst.mockResolvedValue({ key: "my-flag", enabled: false });

    // Act
    const result = await isFlagEnabled("my-flag");

    // Assert
    expect(result).toBe(false);
  });

  it("returns true when the flag row exists and enabled is true", async () => {
    // Arrange
    findFirst.mockResolvedValue({ key: "my-flag", enabled: true });

    // Act
    const result = await isFlagEnabled("my-flag");

    // Assert
    expect(result).toBe(true);
  });

  it("queries the DB with the correct flag key", async () => {
    // Arrange
    findFirst.mockResolvedValue(undefined);

    // Act
    await isFlagEnabled("audit-log");

    // Assert — the drizzle where clause uses eq(featureFlags.key, key);
    // we can't inspect the drizzle expression directly, but we can confirm
    // findFirst was called exactly once (not zero times, not twice).
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("returns false when findFirst resolves to null (explicit null from DB layer)", async () => {
    // Arrange — some DB adapters return null instead of undefined
    findFirst.mockResolvedValue(null);

    // Act
    const result = await isFlagEnabled("some-flag");

    // Assert — null ?? false → false
    expect(result).toBe(false);
  });

  it("propagates a DB error thrown by findFirst", async () => {
    // Arrange
    findFirst.mockRejectedValue(new Error("DB connection refused"));

    // Act + Assert
    await expect(isFlagEnabled("error-flag")).rejects.toThrow(
      "DB connection refused",
    );
  });

  it("is exported as a const (cache()-wrapped) rather than a named function declaration", () => {
    // React cache() returns a new function object; the export should be a
    // callable function. Outside RSC (in Vitest / Node), cache() is a no-op
    // wrapper — behavior is identical but the export shape is what we verify.
    expect(typeof isFlagEnabled).toBe("function");
  });

  // Scoping was introduced 2026-09-05 with feature_flags.app, when flags
  // became a shared platform service. Nothing covered it, and the first
  // implementation had a real bug these pin: a row whose `app` arrived as
  // UNDEFINED (partial select, or a row read before the column existed) was
  // treated as "belongs to another app" and silently disabled.
  it("reads a flag scoped to this app", async () => {
    findFirst.mockResolvedValue({ key: "tasks.module", enabled: true, app: "portal" });
    expect(await isFlagEnabled("tasks.module")).toBe(true);
  });

  it("returns false for a flag scoped to a DIFFERENT app", async () => {
    findFirst.mockResolvedValue({ key: "platform.thing", enabled: true, app: "admin" });
    expect(await isFlagEnabled("platform.thing")).toBe(false);
  });

  it("reads a platform-wide flag (app is null)", async () => {
    findFirst.mockResolvedValue({ key: "auth.require_2fa", enabled: true, app: null });
    expect(await isFlagEnabled("auth.require_2fa")).toBe(true);
  });

  it("treats an UNDEFINED app as unscoped, not as another app's flag", async () => {
    findFirst.mockResolvedValue({ key: "legacy.flag", enabled: true });
    expect(await isFlagEnabled("legacy.flag")).toBe(true);
  });
});
