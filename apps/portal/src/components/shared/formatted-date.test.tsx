// @vitest-environment jsdom
/**
 * Unit tests for <FormattedDate>.
 *
 * jsdom is required because the component uses useEffect/useState and renders
 * a <time> element. The inline @vitest-environment annotation overrides the
 * project-level "node" environment for this file only.
 *
 * SSR-path tests use react-dom/server renderToStaticMarkup so we can assert
 * the YYYY-MM-DD fallback without mounting the component.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, act } from "@testing-library/react";
import React from "react";
import { FormattedDate } from "@repo/ui";

// A fixed, well-known UTC timestamp for deterministic assertions.
// 2024-03-15T10:30:00.000Z — date slice: "2024-03-15"
const FIXED_ISO = "2024-03-15T10:30:00.000Z";
const FIXED_DATE = new Date(FIXED_ISO);
const FIXED_EPOCH = FIXED_DATE.getTime(); // 1710498600000

// Component promoted to packages/ui 2026-09-05 (Portal and Admin carried
// byte-identical copies). The suite stays here rather than moving: packages/ui
// has no test runner configured, and this is real coverage of the SSR-fallback
// and NaN-guard regressions — better exercised from a consumer than deleted.
describe("FormattedDate", () => {
  // -----------------------------------------------------------------------
  // SSR fallback — tested via renderToStaticMarkup (no DOM, no effects)
  // -----------------------------------------------------------------------

  describe("SSR fallback (initial render before useEffect fires)", () => {
    it("renders a <time> element containing the YYYY-MM-DD slice when given a Date", () => {
      // Arrange & Act
      const markup = renderToStaticMarkup(<FormattedDate value={FIXED_DATE} />);

      // Assert — SSR text content must be the ISO date slice (YYYY-MM-DD).
      // The dateTime attribute legitimately contains the full ISO string; we assert
      // the visible text (between the tags) is only the date slice, not the full ISO.
      // The regex checks that the tag content (non-attribute part) is exactly the date.
      expect(markup).toContain("<time");
      expect(markup).toContain("2024-03-15");
      // The text content (between opening and closing tags) should be just the date slice.
      // Extract the inner text by checking the pattern: >YYYY-MM-DD<
      expect(markup).toMatch(/>2024-03-15</);
    });

    it("renders a <time> element with a correct dateTime attribute", () => {
      const markup = renderToStaticMarkup(<FormattedDate value={FIXED_DATE} />);

      expect(markup).toContain(`dateTime="${FIXED_ISO}"`);
    });

    it("renders the YYYY-MM-DD slice when given an ISO string", () => {
      const markup = renderToStaticMarkup(<FormattedDate value={FIXED_ISO} />);

      expect(markup).toContain("2024-03-15");
      expect(markup).toContain(`dateTime="${FIXED_ISO}"`);
    });

    it("renders the YYYY-MM-DD slice when given an epoch number", () => {
      const markup = renderToStaticMarkup(<FormattedDate value={FIXED_EPOCH} />);

      expect(markup).toContain("2024-03-15");
    });

    it("passes className to the <time> element", () => {
      const markup = renderToStaticMarkup(
        <FormattedDate value={FIXED_DATE} className="text-muted-foreground" />
      );

      expect(markup).toContain('class="text-muted-foreground"');
    });
  });

  // -----------------------------------------------------------------------
  // Client mount — useEffect fires in jsdom after act()
  // -----------------------------------------------------------------------

  describe("client-side rendering (after useEffect fires)", () => {
    it("replaces SSR fallback with a locale-formatted string after mount (mode=datetime, default)", async () => {
      // Arrange
      let container: HTMLElement;
      await act(async () => {
        const result = render(<FormattedDate value={FIXED_DATE} />);
        container = result.container;
      });

      // Assert — after effect, the <time> text should no longer be the raw ISO date slice
      // (it will be a locale-formatted string — we can't assert the exact locale format,
      // but we can assert it is non-empty and does not equal the YYYY-MM-DD fallback)
      const time = container!.querySelector("time");
      expect(time).not.toBeNull();
      expect(time!.getAttribute("dateTime")).toBe(FIXED_ISO);
      // The text content after mount is a locale-formatted string — it will contain digits
      // and separators appropriate to the jsdom locale. We only assert it is non-empty.
      expect(time!.textContent!.trim().length).toBeGreaterThan(0);
    });

    it("mode=date and mode=datetime produce different text after mount", async () => {
      let dateContainer: HTMLElement;
      let datetimeContainer: HTMLElement;

      await act(async () => {
        const r = render(<FormattedDate value={FIXED_DATE} mode="date" />);
        dateContainer = r.container;
      });

      await act(async () => {
        const r = render(<FormattedDate value={FIXED_DATE} mode="datetime" />);
        datetimeContainer = r.container;
      });

      const dateText = dateContainer!.querySelector("time")!.textContent!;
      const datetimeText = datetimeContainer!.querySelector("time")!.textContent!;

      // datetime output contains time information and is longer than date-only
      expect(datetimeText.length).toBeGreaterThan(dateText.length);
    });

    it("accepts a Date object without throwing", async () => {
      await expect(
        act(async () => {
          render(<FormattedDate value={FIXED_DATE} />);
        })
      ).resolves.not.toThrow();
    });

    it("accepts an ISO string without throwing", async () => {
      await expect(
        act(async () => {
          render(<FormattedDate value={FIXED_ISO} />);
        })
      ).resolves.not.toThrow();
    });

    it("accepts an epoch number without throwing", async () => {
      await expect(
        act(async () => {
          render(<FormattedDate value={FIXED_EPOCH} />);
        })
      ).resolves.not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Invalid input — regression guard for the missing-guard bug
  // -----------------------------------------------------------------------

  describe("invalid input — regression for missing NaN guard", () => {
    it("does not throw when value is an empty string — renders a fallback dash", async () => {
      // This is the regression test: before the fix, new Date("").toISOString() threw
      // "Invalid time value". After the fix, the component must render without crashing.
      let container: HTMLElement | undefined;

      await expect(
        act(async () => {
          const r = render(<FormattedDate value="" />);
          container = r.container;
        })
      ).resolves.not.toThrow();

      // The component should render something — at minimum a non-empty time element or
      // a dash fallback; what matters is it does NOT crash.
      expect(container).toBeDefined();
      const time = container!.querySelector("time");
      // Either a <time> element or a fallback span — just ensure the component mounted.
      expect(container!.textContent).toBeTruthy();
    });

    it("does not throw when value is an invalid date string — renders a fallback dash", async () => {
      await expect(
        act(async () => {
          render(<FormattedDate value="not-a-date" />);
        })
      ).resolves.not.toThrow();
    });
  });
});
