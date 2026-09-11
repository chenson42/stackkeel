/**
 * Tests for src/lib/email.ts (enqueueEmail) — this app had ZERO coverage of
 * its outbound-email entry point before this file (QA test-coverage review,
 * 2026-09-05), even though it is the only path to invite email, which is
 * the only way a new admin gets access.
 *
 * enqueueEmail() is a thin wrapper over @repo/db's queueEmail() — that
 * function's own real Postgres-column contract is covered by
 * packages/db/src/email-queue.test.ts, so this file only tests THIS
 * wrapper's own logic: the fixed `app: "admin"` tag, its defaults, and its
 * non-throwing failure contract (a queue-write failure must not take down
 * createUserAction/resendInviteAction, whose own DB writes have already
 * committed).
 */

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

const mockQueueEmail = vi.hoisted(() => vi.fn());
vi.mock("@repo/db", () => ({
  queueEmail: mockQueueEmail,
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { enqueueEmail } from "./email";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enqueueEmail — success path", () => {
  it("should always tag the queued message app: 'admin'", async () => {
    // Arrange
    mockQueueEmail.mockResolvedValue({ id: "row-1" });

    // Act
    await enqueueEmail({
      to: "new-admin@example.org",
      subject: "You're invited",
      html: "<p>Welcome</p>",
    });

    // Assert
    expect(mockQueueEmail).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ app: "admin" }),
    );
  });

  it("should default templateKey to 'admin_generic' when omitted", async () => {
    // Arrange
    mockQueueEmail.mockResolvedValue({ id: "row-1" });

    // Act
    await enqueueEmail({
      to: "user@example.org",
      subject: "Test",
      html: "<p>Test</p>",
    });

    // Assert
    expect(mockQueueEmail).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ templateKey: "admin_generic" }),
    );
  });

  it("should pass through an explicit templateKey rather than the default", async () => {
    // Arrange
    mockQueueEmail.mockResolvedValue({ id: "row-1" });

    // Act
    await enqueueEmail({
      to: "user@example.org",
      subject: "Test",
      html: "<p>Test</p>",
      templateKey: "admin_invite",
    });

    // Assert
    expect(mockQueueEmail).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ templateKey: "admin_invite" }),
    );
  });

  it("should pass through an idempotencyKey when supplied", async () => {
    // Arrange
    mockQueueEmail.mockResolvedValue({ id: "row-1" });

    // Act
    await enqueueEmail({
      to: "user@example.org",
      subject: "Test",
      html: "<p>Test</p>",
      idempotencyKey: "invite:user-1:token-1",
    });

    // Assert
    expect(mockQueueEmail).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ idempotencyKey: "invite:user-1:token-1" }),
    );
  });

  it("should return { sent: true, id } on a successful queue write", async () => {
    // Arrange
    mockQueueEmail.mockResolvedValue({ id: "row-42" });

    // Act
    const result = await enqueueEmail({
      to: "user@example.org",
      subject: "Test",
      html: "<p>Test</p>",
    });

    // Assert
    expect(result).toEqual({ sent: true, id: "row-42" });
  });
});

describe("enqueueEmail — failure path (must never throw)", () => {
  it("should return { sent: false } and swallow the error when queueEmail() rejects", async () => {
    // Arrange
    mockQueueEmail.mockRejectedValue(new Error("DB connection timeout"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Act / Assert — must resolve, never reject, so a caller whose own DB
    // write already committed is never taken down by a queue failure.
    await expect(
      enqueueEmail({ to: "user@example.org", subject: "Test", html: "<p>Test</p>" }),
    ).resolves.toEqual({ sent: false });

    expect(consoleSpy).toHaveBeenCalledWith(
      "[platform-admin email] failed to queue message",
      "Test",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("should not include an id when the queue write failed", async () => {
    // Arrange
    mockQueueEmail.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Act
    const result = await enqueueEmail({
      to: "user@example.org",
      subject: "Test",
      html: "<p>Test</p>",
    });

    // Assert
    expect(result.id).toBeUndefined();
  });
});
