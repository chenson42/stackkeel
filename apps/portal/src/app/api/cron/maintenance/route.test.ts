// vi.mock() calls are hoisted before imports by Vitest's transform.
// Mocks for modules that are not available or require env vars in plain Node.js.

// Chainable mock for the Drizzle db object.
// db.execute(sql`...`) → Promise<{ rows: Row[] }>
const mockExecute = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ rows: [] }),
);

vi.mock("@/lib/db", () => ({
  db: {
    execute: mockExecute,
  },
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { GET, buildProjectPurgeQuery, PROJECT_PURGE_AFTER_DAYS } from "./route";

const dialect = new PgDialect();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(authHeader?: string): Request {
  return new Request("http://localhost/api/cron/maintenance", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Auth behavior
// ---------------------------------------------------------------------------

describe("GET /api/cron/maintenance — auth", () => {
  it("returns 503 when CRON_SECRET is not set", async () => {
    // Stub to empty string (falsy) so the guard fires regardless of what
    // the test environment has set.
    vi.stubEnv("CRON_SECRET", "");

    const res = await GET(makeRequest());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/disabled/i);
  });

  it("returns 401 when Authorization header is absent", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header has the wrong bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");

    const res = await GET(makeRequest("Bearer wrong-secret"));

    expect(res.status).toBe(401);
  });

  it("returns 200 with numeric deleted counts on a correct bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    // Simulate: 2 expired pwd-reset rows, 1 email-verify row, 0 totp rows,
    // 3 purged projects (Child B — soft-delete, DECISION-036 item 5).
    mockExecute
      .mockResolvedValueOnce({ rows: [{ id: "a" }, { id: "b" }] }) // pwd_reset
      .mockResolvedValueOnce({ rows: [{ id: "c" }] }) // email_verify
      .mockResolvedValueOnce({ rows: [] }) // totp_pending
      .mockResolvedValueOnce({ rows: [{ id: "d" }, { id: "e" }, { id: "f" }] }); // projects purge

    const res = await GET(makeRequest("Bearer test-secret"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      deletedPwdReset: 2,
      deletedEmailVerify: 1,
      deletedTotpPending: 0,
      deletedProjects: 3,
    });
  });

  it("calls db.execute four times in parallel for a valid request", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");

    await GET(makeRequest("Bearer test-secret"));

    // All four DELETE statements must fire (Promise.all — not short-circuited).
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

});

// ---------------------------------------------------------------------------
// buildProjectPurgeQuery — WHERE clause date-boundary (Child B —
// 2026-08-26-gap-closure-B-soft-delete, DECISION-036 item 5)
// ---------------------------------------------------------------------------

describe("buildProjectPurgeQuery — WHERE clause", () => {
  /**
   * Renders the REAL compiled SQL text via PgDialect.sqlToQuery() (same
   * discipline task-reminders/route.test.ts uses for buildReminderQuery) —
   * a mocked db.execute cannot fail if this predicate is wrong, so this
   * test inspects the literal SQL rather than only asserting a mocked call
   * count.
   */
  it("targets projects.deleted_at IS NOT NULL and the exported 30-day interval", () => {
    const { sql: compiled } = dialect.sqlToQuery(buildProjectPurgeQuery());

    expect(compiled).toMatch(/DELETE FROM "portal"\."projects"/i);
    expect(compiled).toMatch(/"deleted_at"\s+IS\s+NOT\s+NULL/i);

    const match = compiled.match(
      /"deleted_at"\s*<\s*now\(\)\s*-\s*interval\s*'(\d+)\s*days'/i,
    );
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(PROJECT_PURGE_AFTER_DAYS);
    expect(PROJECT_PURGE_AFTER_DAYS).toBe(30);
  });

  it("a project deleted 29 days ago is NOT past the purge cutoff; one deleted 31 days ago IS", () => {
    // Extract the actual interval this query uses from its own compiled SQL
    // (not a re-hardcoded "30" in the test) so this test breaks — rather
    // than silently passing — if a future edit changes the interval without
    // updating PROJECT_PURGE_AFTER_DAYS.
    const { sql: compiled } = dialect.sqlToQuery(buildProjectPurgeQuery());
    const match = compiled.match(
      /"deleted_at"\s*<\s*now\(\)\s*-\s*interval\s*'(\d+)\s*days'/i,
    );
    const purgeAfterDays = Number(match![1]);

    const oneDayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const cutoff = new Date(now - purgeAfterDays * oneDayMs);
    const deletedAt29DaysAgo = new Date(now - 29 * oneDayMs);
    const deletedAt31DaysAgo = new Date(now - 31 * oneDayMs);

    // Mirrors the actual WHERE clause: deleted_at < now() - interval 'N days'.
    expect(deletedAt29DaysAgo.getTime()).toBeGreaterThanOrEqual(cutoff.getTime()); // NOT purged
    expect(deletedAt31DaysAgo.getTime()).toBeLessThan(cutoff.getTime()); // purged
  });
});
