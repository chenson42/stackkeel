/**
 * Tests for readCrossAppAudit() over the kit's single shared audit source
 * (public.audit_events, with the app dimension as a column).
 *
 * Provenance note kept because it is load-bearing: availableSources() MUST
 * alias each to_regclass check (`... AS src_0`) and read back by alias —
 * unaliased checks all get named `?column?` by Postgres, node-postgres
 * collapses the duplicate keys, and every source after the first reads as
 * missing. That misread SHIPPED in a predecessor codebase and reported two
 * healthy sources as never-migrated. The aliasing behavior is pinned here
 * even in the degenerate one-source case so a fork that adds a second
 * source inherits the fix.
 *
 * No live database needed: the row shapes below are the externally verified
 * shapes the driver produces, not a mirror of the implementation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// server-only: build-time bundler guard — mock it out under Vitest.
vi.mock("server-only", () => ({}));

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { execute: mockExecute } }));

import { readCrossAppAudit, parseDate, toExclusiveEnd } from "./cross-app-audit";

const availability = (platform: boolean) => ({ rows: [{ src_0: platform }] });

describe("readCrossAppAudit — availableSources", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("reads the shared source when present and returns its rows", async () => {
    mockExecute
      .mockResolvedValueOnce(availability(true))
      .mockResolvedValueOnce({
        rows: [
          {
            app: "portal",
            id: "1",
            actor_user_id: null,
            actor_email: "a@example.com",
            action: "user.password.changed",
            resource_type: "user",
            resource_id: "u1",
            ip: null,
            user_agent: null,
            metadata: null,
            created_at: new Date("2026-09-01T00:00:00Z"),
          },
        ],
      });

    const result = await readCrossAppAudit();
    expect(result.sources).toEqual(["platform"]);
    expect(result.missing).toEqual([]);
    expect(result.rows).toHaveLength(1);
    // The app value comes from the ROW's own column, not a source literal.
    expect(result.rows[0].app).toBe("portal");
  });

  it("degrades to empty (never throws) when the table is missing, and says so", async () => {
    mockExecute.mockResolvedValueOnce(availability(false));

    const result = await readCrossAppAudit();
    expect(result.rows).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(result.missing).toEqual(["platform"]);
    // Only the availability probe ran — no union query against a missing table.
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("an empty probe result reads as no sources, not as a crash", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const result = await readCrossAppAudit();
    expect(result.rows).toEqual([]);
    expect(result.missing).toEqual(["platform"]);
  });
});

describe("parseDate", () => {
  it("accepts a valid YYYY-MM-DD", () => {
    expect(parseDate("2026-09-10")?.toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });

  it("ignores (returns undefined for) half-typed or invalid input rather than raising", () => {
    expect(parseDate("2026-9")).toBeUndefined();
    expect(parseDate("not-a-date")).toBeUndefined();
    expect(parseDate("2026-13-45")).toBeUndefined();
    expect(parseDate(undefined)).toBeUndefined();
  });
});

describe("toExclusiveEnd", () => {
  it("moves the inclusive end-of-day bound to the start of the next day", () => {
    const d = parseDate("2026-09-10")!;
    expect(toExclusiveEnd(d).toISOString()).toBe("2026-09-11T00:00:00.000Z");
  });
});
