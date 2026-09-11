import { describe, it, expect } from "vitest";
import {
  backoffMs,
  drainQueue,
  enqueue,
  isPoisoningStatus,
  isRetryEligible,
  MAX_ATTEMPTS,
  type QueuedRequest,
  type QueueStorage,
} from "./offline-queue";

function memoryStorage(initial: QueuedRequest[] = []): QueueStorage & {
  rows: () => QueuedRequest[];
} {
  let data = [...initial];
  return {
    read: async () => [...data],
    write: async (rows) => {
      data = [...rows];
    },
    rows: () => data,
  };
}

const row = (over: Partial<QueuedRequest> = {}): QueuedRequest => ({
  id: "r1",
  path: "/api/x",
  body: { a: 1 },
  idempotencyKey: "k1",
  attempts: 0,
  lastAttemptAt: 0,
  poisoned: false,
  ...over,
});

describe("pure decision logic", () => {
  it("backoff doubles from 1s and caps at 5 minutes", () => {
    expect(backoffMs(1)).toBe(1000);
    expect(backoffMs(3)).toBe(4000);
    expect(backoffMs(30)).toBe(300_000);
  });

  it("eligibility: fresh rows always; retried rows wait out the backoff; poisoned never", () => {
    expect(isRetryEligible(row(), 0)).toBe(true);
    expect(isRetryEligible(row({ attempts: 2, lastAttemptAt: 1000 }), 1500)).toBe(false);
    expect(isRetryEligible(row({ attempts: 2, lastAttemptAt: 1000 }), 3001)).toBe(true);
    expect(isRetryEligible(row({ poisoned: true }), 1e12)).toBe(false);
  });

  it("poisoning: 4xx except 429/401", () => {
    expect(isPoisoningStatus(400)).toBe(true);
    expect(isPoisoningStatus(404)).toBe(true);
    expect(isPoisoningStatus(429)).toBe(false);
    expect(isPoisoningStatus(401)).toBe(false);
    expect(isPoisoningStatus(500)).toBe(false);
    expect(isPoisoningStatus(0)).toBe(false);
  });
});

describe("queue round-trip", () => {
  it("enqueue persists a row with a minted idempotency key", async () => {
    const storage = memoryStorage();
    await enqueue("/api/x", { a: 1 }, storage);
    expect(storage.rows()).toHaveLength(1);
    expect(storage.rows()[0]!.idempotencyKey).toMatch(/^oq-/);
  });

  it("drain removes successes, keeps network failures with backoff, poisons 4xx", async () => {
    const storage = memoryStorage([
      row({ id: "ok", idempotencyKey: "k-ok" }),
      row({ id: "net", idempotencyKey: "k-net" }),
      row({ id: "bad", idempotencyKey: "k-bad" }),
    ]);
    const result = await drainQueue(
      storage,
      async (_path, _body, key) => {
        if (key === "k-ok") return { ok: true, status: 200, data: null };
        if (key === "k-net") return { ok: false, status: 0, reason: "network_error" };
        return { ok: false, status: 422, reason: "invalid_input" };
      },
      () => 10_000,
    );
    expect(result).toEqual({ sent: 1, remaining: 1, poisoned: 1 });
    const ids = storage.rows().map((r) => r.id);
    expect(ids).toEqual(["net", "bad"]);
    expect(storage.rows().find((r) => r.id === "net")!.attempts).toBe(1);
    expect(storage.rows().find((r) => r.id === "bad")!.poisoned).toBe(true);
  });

  it("skips rows still inside their backoff window untouched", async () => {
    const storage = memoryStorage([row({ attempts: 3, lastAttemptAt: 9_000 })]);
    const result = await drainQueue(
      storage,
      async () => {
        throw new Error("send must not be called");
      },
      () => 9_500, // 500ms after last attempt; backoff(3) = 4000ms
    );
    expect(result).toEqual({ sent: 0, remaining: 1, poisoned: 0 });
    expect(storage.rows()[0]!.attempts).toBe(3);
  });

  it("poisons after MAX_ATTEMPTS network failures", async () => {
    const storage = memoryStorage([
      row({ attempts: MAX_ATTEMPTS - 1, lastAttemptAt: 0 }),
    ]);
    await drainQueue(
      storage,
      async () => ({ ok: false, status: 0, reason: "network_error" }),
      () => 1e12,
    );
    expect(storage.rows()[0]!.poisoned).toBe(true);
  });
});
