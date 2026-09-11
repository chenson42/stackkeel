/**
 * Unit tests for the maintenance GC cron. Mocks the db client; asserts the
 * auth gates (503 unconfigured / 401 wrong bearer — the visible-failure
 * posture), the per-table fanout, and the compiled SQL's shape (public
 * schema, expires_at predicate, LIMIT 500) — the exact regression class
 * this route once shipped: ancestor-schema-qualified table names that no
 * table in this kit answers to.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const executeMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { execute: (...a: unknown[]) => executeMock(...a) },
}));

import { GET, GC_TABLES, buildGcQuery } from "./route";

const dialect = new PgDialect();

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/cron/maintenance", { headers });
}

describe("GET /api/cron/maintenance", () => {
  beforeEach(() => {
    executeMock.mockReset();
    executeMock.mockResolvedValue({ rows: [{ id: "x" }] });
    process.env.CRON_SECRET = "test-cron-secret";
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns 503 (visible failure, not silent no-op) when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(request());
    expect(res.status).toBe(503);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("returns 401 on a missing or wrong bearer token", async () => {
    expect((await GET(request())).status).toBe(401);
    expect(
      (await GET(request({ authorization: "Bearer wrong" }))).status,
    ).toBe(401);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("runs one DELETE per GC table and reports per-table counts", async () => {
    const res = await GET(request({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    expect(executeMock).toHaveBeenCalledTimes(GC_TABLES.length);
    const body = (await res.json()) as { ok: boolean; deleted: Record<string, number> };
    expect(body.ok).toBe(true);
    for (const t of GC_TABLES) expect(body.deleted[t.table]).toBe(1);
  });
});

describe("buildGcQuery", () => {
  it("targets public-schema tables with the expires_at predicate and the 500 cap", () => {
    for (const t of GC_TABLES) {
      const compiled = dialect.sqlToQuery(buildGcQuery(t.table, t.key)).sql;
      expect(compiled).toContain(`"public"."${t.table}"`);
      expect(compiled).toContain(`"expires_at" < now()`);
      expect(compiled).toContain("LIMIT 500");
      expect(compiled).toContain(`RETURNING "${t.key}"`);
    }
  });

  it("covers exactly the four platform token tables — no ancestor tables", () => {
    expect(GC_TABLES.map((t) => t.table).sort()).toEqual([
      "email_verification_tokens",
      "invite_tokens",
      "password_reset_tokens",
      "user_totp_pending_enrollments",
    ]);
  });
});
