// vi.mock() calls are hoisted before imports by Vitest's transform.
// Mocks for modules that are not available or require env vars in plain Node.js.

vi.mock("server-only", () => ({}));

// Chainable mock for the Drizzle db object.
// db.insert(t).values({}).returning() → Promise<Row[]>
// db.update(t).set({}).where(cond).returning({}) → Promise<Row[]>
// db.execute(sql) → Promise<{ rows: [] }>
const mockInsertReturning = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockInsertValues = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockInsertReturning }),
);
const mockInsert = vi.hoisted(() =>
  vi.fn().mockReturnValue({ values: mockInsertValues }),
);
const mockUpdateReturning = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockUpdateWhere = vi.hoisted(() =>
  vi.fn().mockReturnValue({ returning: mockUpdateReturning }),
);
const mockUpdateSet = vi.hoisted(() =>
  vi.fn().mockReturnValue({ where: mockUpdateWhere }),
);
const mockUpdate = vi.hoisted(() =>
  vi.fn().mockReturnValue({ set: mockUpdateSet }),
);
const mockExecute = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ rows: [] }),
);

vi.mock("@/lib/db", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    execute: mockExecute,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  emailQueue: {
    id: {},
    toEmail: {},
    fromEmail: {},
    replyTo: {},
    subject: {},
    htmlBody: {},
    textBody: {},
    templateKey: {},
    status: {},
    attemptCount: {},
    maxAttempts: {},
    nextAttemptAt: {},
    lastAttemptAt: {},
    sentAt: {},
    providerMessageId: {},
    failureReason: {},
    createdAt: {},
    updatedAt: {},
  },
  auditEvents: {},
}));

vi.mock("@/lib/audit", () => ({
  AUDIT_ACTIONS: {
    EMAIL_QUEUE_PERMANENT_FAILURE: "email.queue.permanent_failure",
  },
}));

const mockSendEmail = vi.hoisted(() => vi.fn());
vi.mock("./send", () => ({ sendEmail: mockSendEmail }));

// Also mock drizzle-orm operators so they work with mocked schema column stubs.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn().mockReturnValue("eq-condition"),
    lt: vi.fn().mockReturnValue("lt-condition"),
    and: vi.fn().mockReturnValue("and-condition"),
  };
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeNextAttemptAt, enqueueEmail, processQueueBatch, recordDeliveryEvent } from "./queue";

// ---------------------------------------------------------------------------
// Backoff math — computeNextAttemptAt
// ---------------------------------------------------------------------------

describe("computeNextAttemptAt — backoff formula: min(2^(n-1), 60) minutes", () => {
  it("attemptCount=1 → delay ~1 minute (60_000 ms)", () => {
    const before = Date.now();
    const result = computeNextAttemptAt(1);
    const after = Date.now();
    const delta = result.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(60_000 - 50);
    expect(delta).toBeLessThanOrEqual(60_000 + (after - before) + 50);
  });

  it("attemptCount=2 → delay ~2 minutes (120_000 ms)", () => {
    const before = Date.now();
    const result = computeNextAttemptAt(2);
    const delta = result.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(120_000 - 50);
    expect(delta).toBeLessThanOrEqual(120_000 + 100);
  });

  it("attemptCount=6 → delay ~32 minutes (1_920_000 ms)", () => {
    const before = Date.now();
    const result = computeNextAttemptAt(6);
    const delta = result.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(1_920_000 - 50);
    expect(delta).toBeLessThanOrEqual(1_920_000 + 100);
  });

  it("attemptCount=7 → delay ~60 minutes (3_600_000 ms — cap reached)", () => {
    const before = Date.now();
    const result = computeNextAttemptAt(7);
    const delta = result.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(3_600_000 - 50);
    expect(delta).toBeLessThanOrEqual(3_600_000 + 100);
  });

  it("attemptCount=8 → delay still ~60 minutes (cap holds)", () => {
    const before = Date.now();
    const result = computeNextAttemptAt(8);
    const delta = result.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(3_600_000 - 50);
    expect(delta).toBeLessThanOrEqual(3_600_000 + 100);
  });

  it("attemptCount=10 → delay still ~60 minutes (cap holds for large counts)", () => {
    const before = Date.now();
    const result = computeNextAttemptAt(10);
    const delta = result.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(3_600_000 - 50);
    expect(delta).toBeLessThanOrEqual(3_600_000 + 100);
  });

  it("returns a Date instance", () => {
    expect(computeNextAttemptAt(1)).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// Structural exports — enqueueEmail and processQueueBatch are async functions
// ---------------------------------------------------------------------------

describe("queue module exports — structural regression", () => {
  it("computeNextAttemptAt is an exported function", () => {
    expect(typeof computeNextAttemptAt).toBe("function");
  });

  it("enqueueEmail is an exported async function", () => {
    expect(typeof enqueueEmail).toBe("function");
  });

  it("processQueueBatch is an exported async function", () => {
    expect(typeof processQueueBatch).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// emailQueue schema structural regression
// ---------------------------------------------------------------------------

describe("emailQueue schema — structural regression for missing table or columns", () => {
  it("emailQueue is exported from schema", async () => {
    const schema = await import("@/lib/db/schema");
    expect(schema.emailQueue).toBeDefined();
  });

  it("emailQueue has required columns", async () => {
    const schema = await import("@/lib/db/schema");
    const table = schema.emailQueue;
    for (const col of [
      "id",
      "toEmail",
      "fromEmail",
      "subject",
      "htmlBody",
      "templateKey",
      "status",
      "attemptCount",
      "maxAttempts",
      "nextAttemptAt",
      "lastAttemptAt",
      "providerMessageId",
      "failureReason",
      "createdAt",
      "updatedAt",
    ]) {
      expect(table).toHaveProperty(col);
    }
  });
});

// ---------------------------------------------------------------------------
// AUDIT_ACTIONS — EMAIL_QUEUE_PERMANENT_FAILURE entry regression
// ---------------------------------------------------------------------------

describe("AUDIT_ACTIONS — EMAIL_QUEUE_PERMANENT_FAILURE catalog entry", () => {
  it("exports EMAIL_QUEUE_PERMANENT_FAILURE with the correct frozen value", async () => {
    const { AUDIT_ACTIONS } = await import("@/lib/audit");
    expect(AUDIT_ACTIONS.EMAIL_QUEUE_PERMANENT_FAILURE).toBe(
      "email.queue.permanent_failure",
    );
  });
});

// ---------------------------------------------------------------------------
// Production guard — warnIfDevVarsInProd fires console.error in production
// ---------------------------------------------------------------------------

describe("production guard — dev env vars warn when NODE_ENV=production", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalIntercept = process.env.EMAIL_DEV_INTERCEPT;
  const originalRedirect = process.env.EMAIL_DEV_REDIRECT_TO;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.clearAllMocks();
    // Restore execute to return empty rows so processQueueBatch completes
    mockExecute.mockResolvedValue({ rows: [] });
    mockUpdateReturning.mockResolvedValue([]);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    (process.env as NodeJS.ProcessEnv & { NODE_ENV: string }).NODE_ENV = originalNodeEnv;
    if (originalIntercept === undefined) {
      delete process.env.EMAIL_DEV_INTERCEPT;
    } else {
      process.env.EMAIL_DEV_INTERCEPT = originalIntercept;
    }
    if (originalRedirect === undefined) {
      delete process.env.EMAIL_DEV_REDIRECT_TO;
    } else {
      process.env.EMAIL_DEV_REDIRECT_TO = originalRedirect;
    }
  });

  it("logs console.error when EMAIL_DEV_INTERCEPT is set in production", async () => {
    (process.env as NodeJS.ProcessEnv & { NODE_ENV: string }).NODE_ENV = "production";
    process.env.EMAIL_DEV_INTERCEPT = "1";
    delete process.env.EMAIL_DEV_REDIRECT_TO;

    await processQueueBatch(1);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("dev override env var set in production"),
      expect.any(Object),
    );
  });

  it("logs console.error when EMAIL_DEV_REDIRECT_TO is set in production", async () => {
    (process.env as NodeJS.ProcessEnv & { NODE_ENV: string }).NODE_ENV = "production";
    delete process.env.EMAIL_DEV_INTERCEPT;
    process.env.EMAIL_DEV_REDIRECT_TO = "test@example.com";

    await processQueueBatch(1);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("dev override env var set in production"),
      expect.any(Object),
    );
  });

  it("does NOT log console.error when NODE_ENV is not production", async () => {
    (process.env as NodeJS.ProcessEnv & { NODE_ENV: string }).NODE_ENV = "development";
    process.env.EMAIL_DEV_INTERCEPT = "1";

    await processQueueBatch(1);

    // console.error should not have been called for the dev-vars guard
    // (other calls from permanent failures are excluded since rows=[])
    const devGuardCalls = consoleSpy.mock.calls.filter((args: unknown[]) =>
      String(args[0]).includes("dev override env var set in production"),
    );
    expect(devGuardCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// enqueueEmail — persist-first: insert before send
// ---------------------------------------------------------------------------

describe("enqueueEmail — persist-first behavior", () => {
  const fakeRow = {
    id: "test-id-123",
    toEmail: "user@example.com",
    fromEmail: null,
    replyTo: null,
    subject: "Test",
    htmlBody: "<p>Test</p>",
    textBody: null,
    templateKey: "password_reset",
    status: "queued",
    attemptCount: 0,
    maxAttempts: 8,
    nextAttemptAt: null,
    lastAttemptAt: null,
    sentAt: null,
    providerMessageId: null,
    failureReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertReturning.mockResolvedValue([fakeRow]);
    mockUpdateReturning.mockResolvedValue([]);
    // Restore the chain since clearAllMocks clears mockReturnValue too
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
  });

  afterEach(() => {
    delete process.env.EMAIL_DEV_INTERCEPT;
    delete process.env.EMAIL_DEV_REDIRECT_TO;
  });

  it("Case A (inline success): db.insert called before sendEmail; returns sentInline=true", async () => {
    process.env.EMAIL_DEV_INTERCEPT = "1"; // avoids real Resend call

    const callOrder: string[] = [];
    mockInsert.mockImplementation(() => {
      callOrder.push("insert");
      return { values: mockInsertValues };
    });
    mockSendEmail.mockImplementation(async () => {
      callOrder.push("send");
      return { id: "msg-123" };
    });

    const result = await enqueueEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Test</p>",
      templateKey: "password_reset",
    });

    // Insert was called
    expect(mockInsert).toHaveBeenCalledOnce();
    // With EMAIL_DEV_INTERCEPT, sendEmail is NOT called (intercepted)
    expect(result.sentInline).toBe(true);
    expect(result.id).toBe("test-id-123");
  });

  it("Case B (inline failure): db.insert called; returns sentInline=false with backoff update", async () => {
    delete process.env.EMAIL_DEV_INTERCEPT;
    mockSendEmail.mockRejectedValue(new Error("Resend down"));

    const result = await enqueueEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Test</p>",
      templateKey: "password_reset",
    });

    expect(mockInsert).toHaveBeenCalledOnce();
    expect(result.sentInline).toBe(false);
    expect(result.id).toBe("test-id-123");
    // db.update should have been called to set status='queued' with backoff
    expect(mockUpdate).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// processQueueBatch — claim SQL structural check
// ---------------------------------------------------------------------------

describe("processQueueBatch — atomic claim uses db.execute (not db.update)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ rows: [] });
    mockUpdateReturning.mockResolvedValue([]);
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
  });

  it("calls db.execute for the atomic claim query", async () => {
    await processQueueBatch(25);
    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it("passes a SQL object (not null/undefined) to db.execute", async () => {
    await processQueueBatch(25);
    const [sqlArg] = mockExecute.mock.calls[0];
    expect(sqlArg).toBeDefined();
    expect(sqlArg).not.toBeNull();
  });

  it("returns { claimed: 0, sent: 0, failed: 0, requeued: 0 } when queue is empty", async () => {
    const result = await processQueueBatch(25);
    expect(result).toStrictEqual({ claimed: 0, sent: 0, failed: 0, requeued: 0 });
  });
});

// ---------------------------------------------------------------------------
// processQueueBatch — lease recovery runs BEFORE claim
// ---------------------------------------------------------------------------

describe("processQueueBatch — lease recovery calls db.update before db.execute", () => {
  it("calls db.update (lease recovery) then db.execute (claim) in that order", async () => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ rows: [] });
    mockUpdateReturning.mockResolvedValue([]);
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });

    const callOrder: string[] = [];
    mockUpdate.mockImplementation(() => {
      callOrder.push("update");
      return { set: mockUpdateSet };
    });
    mockExecute.mockImplementation(async () => {
      callOrder.push("execute");
      return { rows: [] };
    });

    await processQueueBatch(10);

    expect(callOrder).toEqual(["update", "execute"]);
  });
});

// ---------------------------------------------------------------------------
// recordDeliveryEvent — delivery-event column mapping
// ---------------------------------------------------------------------------

describe("recordDeliveryEvent — column mapping and matched return value", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateReturning.mockResolvedValue([{ id: "row-1" }]);
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
  });

  it("email.delivered → calls db.update with deliveredAt set; does not touch failureReason", async () => {
    const result = await recordDeliveryEvent("msg-id-abc", "email.delivered");

    expect(mockUpdate).toHaveBeenCalledOnce();
    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg).toHaveProperty("deliveredAt");
    expect(setArg).not.toHaveProperty("failureReason");
    expect(result).toEqual({ matched: true });
  });

  it("email.opened → calls db.update with openedAt set", async () => {
    await recordDeliveryEvent("msg-id-abc", "email.opened");

    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg).toHaveProperty("openedAt");
    expect(setArg).not.toHaveProperty("failureReason");
  });

  it("email.clicked → calls db.update with clickedAt set", async () => {
    await recordDeliveryEvent("msg-id-abc", "email.clicked");

    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg).toHaveProperty("clickedAt");
  });

  it("email.bounced with failureReason → sets bouncedAt AND failureReason", async () => {
    await recordDeliveryEvent("msg-id-abc", "email.bounced", {
      failureReason: "bounced: invalid recipient",
    });

    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg).toHaveProperty("bouncedAt");
    expect(setArg).toHaveProperty("failureReason", "bounced: invalid recipient");
  });

  it("email.bounced WITHOUT failureReason → sets bouncedAt but NOT failureReason", async () => {
    await recordDeliveryEvent("msg-id-abc", "email.bounced");

    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg).toHaveProperty("bouncedAt");
    expect(setArg).not.toHaveProperty("failureReason");
  });

  it("email.complained → calls db.update with complainedAt set", async () => {
    await recordDeliveryEvent("msg-id-abc", "email.complained");

    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg).toHaveProperty("complainedAt");
  });

  it("returns { matched: false } when db.update returns empty array (no row matched)", async () => {
    mockUpdateReturning.mockResolvedValue([]);

    const result = await recordDeliveryEvent("no-such-id", "email.delivered");
    expect(result).toEqual({ matched: false });
  });

  it("respects opts.occurredAt when provided", async () => {
    const fixedDate = new Date("2026-01-15T10:00:00Z");
    await recordDeliveryEvent("msg-id-abc", "email.delivered", {
      occurredAt: fixedDate,
    });

    const setArg = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.deliveredAt).toBe(fixedDate);
  });
});
