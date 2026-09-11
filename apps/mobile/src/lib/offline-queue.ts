/**
 * Offline write queue (module `mobile`) — AsyncStorage-persisted, replayed
 * with exponential backoff. For writes a device may perform while
 * disconnected; every queued request carries an Idempotency-Key so a replay
 * that already landed server-side de-dups (mobile-developer invariant 3).
 *
 * Pure decision logic (backoff, eligibility, poisoning) is exported and
 * dependency-injected (storage + api + clock) for unit tests.
 *
 * Deliberately simple: FIFO, drain-on-demand (call drainQueue() from a
 * screen focus / connectivity listener), poison after MAX_ATTEMPTS. The
 * backend stays the store of record — nothing here is ever read back as
 * app state (invariant 4).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiPost, type ApiResult } from "./api-client";

const STORAGE_KEY = "offline_queue_v1";
export const MAX_ATTEMPTS = 8;

export interface QueuedRequest {
  id: string;
  path: string;
  body: unknown;
  idempotencyKey: string;
  attempts: number;
  /** Epoch ms of the last attempt; 0 = never tried. */
  lastAttemptAt: number;
  poisoned: boolean;
}

export interface QueueStorage {
  read: () => Promise<QueuedRequest[]>;
  write: (rows: QueuedRequest[]) => Promise<void>;
}

const asyncStorageBackend: QueueStorage = {
  read: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? (parsed as QueuedRequest[]) : [];
    } catch {
      return []; // corrupt queue = empty queue; the backend is the record
    }
  },
  write: (rows) => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rows)),
};

// ---------------------------------------------------------------------------
// Pure decision logic
// ---------------------------------------------------------------------------

/** 1s, 2s, 4s … capped at 5 min. */
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempts - 1), 5 * 60 * 1000);
}

export function isRetryEligible(row: QueuedRequest, now: number): boolean {
  if (row.poisoned) return false;
  if (row.attempts === 0) return true;
  return now - row.lastAttemptAt >= backoffMs(row.attempts);
}

/** 4xx (except 429) = the request itself is bad; retrying cannot fix it. */
export function isPoisoningStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429 && status !== 401;
}

// ---------------------------------------------------------------------------
// Queue operations
// ---------------------------------------------------------------------------

export async function enqueue(
  path: string,
  body: unknown,
  storage: QueueStorage = asyncStorageBackend,
): Promise<void> {
  const rows = await storage.read();
  rows.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    path,
    body,
    idempotencyKey: `oq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    attempts: 0,
    lastAttemptAt: 0,
    poisoned: false,
  });
  await storage.write(rows);
}

export type SendFn = (
  path: string,
  body: unknown,
  idempotencyKey: string,
) => Promise<ApiResult<unknown>>;

const defaultSend: SendFn = (path, body, idempotencyKey) =>
  apiPost(path, body, { idempotencyKey });

/**
 * Attempt every eligible row once, in order. Success and poison rows are
 * removed/marked; network failures stay for the next drain. Returns counts
 * for the caller's logging.
 */
export async function drainQueue(
  storage: QueueStorage = asyncStorageBackend,
  send: SendFn = defaultSend,
  now: () => number = Date.now,
): Promise<{ sent: number; remaining: number; poisoned: number }> {
  const rows = await storage.read();
  const keep: QueuedRequest[] = [];
  let sent = 0;
  let poisoned = 0;

  for (const row of rows) {
    if (!isRetryEligible(row, now())) {
      keep.push(row);
      continue;
    }
    const result = await send(row.path, row.body, row.idempotencyKey);
    if (result.ok) {
      sent++;
      continue;
    }
    const next: QueuedRequest = {
      ...row,
      attempts: row.attempts + 1,
      lastAttemptAt: now(),
      poisoned:
        isPoisoningStatus(result.status) || row.attempts + 1 >= MAX_ATTEMPTS,
    };
    if (next.poisoned) poisoned++;
    keep.push(next);
  }

  await storage.write(keep);
  return {
    sent,
    remaining: keep.filter((r) => !r.poisoned).length,
    poisoned,
  };
}
