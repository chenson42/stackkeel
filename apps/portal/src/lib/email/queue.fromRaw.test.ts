/**
 * fromRaw() — the db.execute(sql`RETURNING *`) → camelCase mapper in
 * queue.ts. This function has gone stale TWICE in one day (the `app`
 * column, then `idempotency_key`) — see queue.ts's own MAINTENANCE NOTE.
 * Every other test in this directory (queue.test.ts) stubs `@/lib/db` and
 * `@/lib/db/schema` entirely, so `db.execute` always resolves to
 * `{ rows: [] }` and fromRaw() never actually runs against a row shaped
 * like a real one — its return type being pinned to
 * `typeof emailQueue.$inferSelect` was the ONLY thing catching drift.
 *
 * This file is deliberately separate from queue.test.ts and does NOT mock
 * "@/lib/db/schema" — it uses the REAL `emailQueue` table object, and
 * builds the fake "RETURNING *" row by walking that table's real column
 * definitions (drizzle's `getTableColumns()`), not by hand-typing a
 * snake_case object. That is the point: a hand-typed fixture row would only
 * ever encode whatever column names the test author assumed, which is
 * exactly the self-agreeing-mock failure mode QA is meant to catch (per
 * sagacraft dfe7add). Sourcing the raw keys from the schema itself means
 * that if fromRaw()'s hardcoded snake_case reads ever fall out of sync with
 * a renamed/added column, this test's generated row will have a DIFFERENT
 * key than fromRaw() reads, fromRaw() will produce `undefined` for that
 * field, and the assertion against the schema-derived expected value fails.
 *
 * Raw timestamp values are encoded as ISO STRINGS, not JS Date objects —
 * matching what db.execute() with raw SQL actually hands back (see
 * queue.ts's own comment: "db.execute() with raw SQL returns snake_case
 * column names from the DB" and RawQueueRow's timestamp fields being typed
 * `string | null`; this is also why the repo has a dedicated
 * `check:sql-date` tripwire against that Drizzle date-typing footgun).
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/audit", () => ({ AUDIT_ACTIONS: {} }));
vi.mock("./send", () => ({ sendEmail: vi.fn() }));

import { describe, it, expect, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { emailQueue } from "@/lib/db/schema";
import { fromRaw } from "./queue";

type ColumnInfo = { dbName: string; dataType: string; notNull: boolean };

function realColumns(): Record<string, ColumnInfo> {
  const cols = getTableColumns(emailQueue);
  const out: Record<string, ColumnInfo> = {};
  for (const [jsKey, col] of Object.entries(cols)) {
    out[jsKey] = { dbName: col.name, dataType: col.dataType, notNull: col.notNull };
  }
  return out;
}

/** A representative non-null value per drizzle dataType, and the value
 * fromRaw() is expected to produce for it (mirrors fromRaw()'s own
 * per-field transform: dates get wrapped in `new Date(...)`, everything
 * else passes through unchanged). */
function sampleFor(jsKey: string, info: ColumnInfo): { raw: unknown; expected: unknown } {
  switch (info.dataType) {
    case "date": {
      const iso = "2026-01-15T10:00:00.000Z";
      return { raw: iso, expected: new Date(iso) };
    }
    case "number": {
      const n = jsKey === "attemptCount" ? 2 : 8;
      return { raw: n, expected: n };
    }
    case "boolean":
      return { raw: true, expected: true };
    case "string":
    default: {
      const s = `${info.dbName}-value`;
      return { raw: s, expected: s };
    }
  }
}

describe("fromRaw — schema-driven raw row, all nullable columns populated", () => {
  it("maps every real emailQueue column from its snake_case DB name to the correct camelCase field and value", () => {
    // Arrange
    const columns = realColumns();
    const raw: Record<string, unknown> = {};
    const expected: Record<string, unknown> = {};
    for (const [jsKey, info] of Object.entries(columns)) {
      const { raw: rawValue, expected: expectedValue } = sampleFor(jsKey, info);
      raw[info.dbName] = rawValue;
      expected[jsKey] = expectedValue;
    }

    // Act
    const result = fromRaw(raw as any);

    // Assert — every column the real schema knows about, not a hand-picked
    // subset, so a newly-added column with no fromRaw() entry shows up here
    // as `undefined` instead of the expected value.
    for (const jsKey of Object.keys(columns)) {
      expect(result).toHaveProperty(jsKey, expected[jsKey]);
    }
  });
});

describe("fromRaw — schema-driven raw row, all nullable columns null", () => {
  it("passes through null for every nullable column instead of throwing or coercing", () => {
    // Arrange
    const columns = realColumns();
    const raw: Record<string, unknown> = {};
    const expected: Record<string, unknown> = {};
    for (const [jsKey, info] of Object.entries(columns)) {
      if (info.notNull) {
        const { raw: rawValue, expected: expectedValue } = sampleFor(jsKey, info);
        raw[info.dbName] = rawValue;
        expected[jsKey] = expectedValue;
      } else {
        raw[info.dbName] = null;
        expected[jsKey] = null;
      }
    }

    // Act
    const result = fromRaw(raw as any);

    // Assert
    for (const jsKey of Object.keys(columns)) {
      expect(result).toHaveProperty(jsKey, expected[jsKey]);
    }
  });
});

describe("fromRaw — regression for the app/idempotencyKey staleness (2026-09-05)", () => {
  it("maps the app column (added, then briefly missed) to the app field", () => {
    // Arrange
    const columns = realColumns();
    const raw: Record<string, unknown> = { app: "billing" };
    for (const [jsKey, info] of Object.entries(columns)) {
      if (jsKey === "app") continue;
      const populated = info.notNull ? sampleFor(jsKey, info).raw : null;
      raw[info.dbName] = populated;
    }

    // Act
    const result = fromRaw(raw as any);

    // Assert
    expect(result.app).toBe("billing");
  });

  it("maps the idempotency_key column (added, then briefly missed) to the idempotencyKey field", () => {
    // Arrange
    const columns = realColumns();
    const raw: Record<string, unknown> = { idempotency_key: "invite:user-1:token-1" };
    for (const [jsKey, info] of Object.entries(columns)) {
      if (jsKey === "idempotencyKey") continue;
      const populated = info.notNull ? sampleFor(jsKey, info).raw : null;
      raw[info.dbName] = populated;
    }

    // Act
    const result = fromRaw(raw as any);

    // Assert
    expect(result.idempotencyKey).toBe("invite:user-1:token-1");
  });
});
