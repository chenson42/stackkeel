/**
 * Pure date-utility helpers for the feedback feature.
 *
 * Extracted from actions.ts so they can be tested independently without
 * requiring a "use server" context. Next.js 16 Turbopack requires all
 * exports from "use server" files to be async Server Actions — non-async
 * utilities must live in a separate module.
 */

// ---------------------------------------------------------------------------
// computeLocalDate
// ---------------------------------------------------------------------------

/**
 * Compute the member's local calendar date from a client-provided TZ offset.
 *
 * JS `new Date().getTimezoneOffset()` returns MINUTES WEST of UTC:
 *   - Positive = behind UTC (e.g. UTC-5 → 300)
 *   - Negative = ahead of UTC (e.g. UTC+9 → -540)
 * Local time = UTC − offsetMinutes.
 *
 * Clamps to the valid IANA TZ offset range [-720, +840].
 * Falls back to UTC (offset=0) when the value is null or undefined.
 *
 * Known imprecision: the shouldShow suppression check reads UTC "today" while
 * write operations store the member's local date. See DECISION-023.
 */
export function computeLocalDate(
  tzOffsetMinutes: number | null | undefined,
): string {
  const offset =
    typeof tzOffsetMinutes === "number"
      ? Math.max(-720, Math.min(840, tzOffsetMinutes))
      : 0; // fallback to UTC when absent (DECISION-023)
  const localMs = Date.now() - offset * 60_000;
  return new Date(localMs).toISOString().slice(0, 10); // 'YYYY-MM-DD'
}
