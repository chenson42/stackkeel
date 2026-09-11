/**
 * Unit tests for validateWhatsNewEntry().
 *
 * All cases are pure (no DB, no auth) — the helper is a plain function.
 * See Phase 2 Ruling 6 and Phase 3 test spec for required test vectors.
 */

import { describe, it, expect } from "vitest";
import { validateWhatsNewEntry } from "./validate";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function valid(
  overrides: Partial<{ emoji: string; title: string; body: string }> = {},
) {
  return {
    emoji: "",
    title: "A valid title",
    body: "A valid body that describes the update.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// emoji field
// ---------------------------------------------------------------------------

describe("validateWhatsNewEntry — emoji field", () => {
  it("1. empty emoji (optional field) → ok:true", () => {
    const result = validateWhatsNewEntry(valid({ emoji: "" }));
    expect(result.ok).toBe(true);
  });

  it("2. single emoji 🎉 ([...spread].length === 1) → ok:true", () => {
    const result = validateWhatsNewEntry(valid({ emoji: "🎉" }));
    expect(result.ok).toBe(true);
    // Verify the spread length assumption that drives the rule
    expect([..."🎉"].length).toBe(1);
  });

  it("3. two emoji 🎉🚀 (2 code points) → ok:true", () => {
    const result = validateWhatsNewEntry(valid({ emoji: "🎉🚀" }));
    expect(result.ok).toBe(true);
    expect([..."🎉🚀"].length).toBe(2);
  });

  it("4. three emoji 🎉🚀✨ (3 code points) → ok:false with emoji error", () => {
    const result = validateWhatsNewEntry(valid({ emoji: "🎉🚀✨" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.emoji).toBeDefined();
    }
  });

  it("5. multi-codepoint glyph 👨‍👩‍👧‍👦 ([...spread].length === 7) → ok:false", () => {
    // This is the critical security invariant: using emoji.length instead of
    // [...emoji].length would yield 11, not 2. The spread check correctly rejects.
    const family = "👨‍👩‍👧‍👦";
    expect([...family].length).toBeGreaterThan(2);
    const result = validateWhatsNewEntry(valid({ emoji: family }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.emoji).toBeDefined();
    }
  });

  it("whitespace-only emoji is treated as empty → ok:true (no emoji error)", () => {
    const result = validateWhatsNewEntry(valid({ emoji: "   " }));
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// title field
// ---------------------------------------------------------------------------

describe("validateWhatsNewEntry — title field", () => {
  it("6. HTML in title: <script>alert(1)</script> → ok:false with title error", () => {
    // Required test vector from Phase 2 Ruling 6 and Phase 3.
    const result = validateWhatsNewEntry(
      valid({ title: "<script>alert(1)</script>" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toBeDefined();
    }
  });

  it("8. title length > 100 chars → ok:false with title error", () => {
    const result = validateWhatsNewEntry(
      valid({ title: "A".repeat(101) }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toBeDefined();
    }
  });

  it("title of exactly 100 chars → ok:true", () => {
    const result = validateWhatsNewEntry(
      valid({ title: "A".repeat(100) }),
    );
    expect(result.ok).toBe(true);
  });

  it("10. empty title → ok:false with title error", () => {
    const result = validateWhatsNewEntry(valid({ title: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toBeDefined();
    }
  });

  it("whitespace-only title → ok:false (treated as empty)", () => {
    const result = validateWhatsNewEntry(valid({ title: "   " }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toBeDefined();
    }
  });

  it("HTML img tag in title → ok:false", () => {
    const result = validateWhatsNewEntry(
      valid({ title: '<img src="x" onerror="alert(1)">' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// body field
// ---------------------------------------------------------------------------

describe("validateWhatsNewEntry — body field", () => {
  it("7. HTML in body: <b>bold</b> → ok:false with body error", () => {
    const result = validateWhatsNewEntry(valid({ body: "<b>bold</b>" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.body).toBeDefined();
    }
  });

  it("9. body length > 500 chars → ok:false with body error", () => {
    const result = validateWhatsNewEntry(
      valid({ body: "A".repeat(501) }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.body).toBeDefined();
    }
  });

  it("body of exactly 500 chars → ok:true", () => {
    const result = validateWhatsNewEntry(
      valid({ body: "A".repeat(500) }),
    );
    expect(result.ok).toBe(true);
  });

  it("11. empty body → ok:false with body error", () => {
    const result = validateWhatsNewEntry(valid({ body: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.body).toBeDefined();
    }
  });

  it("whitespace-only body → ok:false (treated as empty)", () => {
    const result = validateWhatsNewEntry(valid({ body: "   " }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.body).toBeDefined();
    }
  });

  it("<script>alert(1)</script> in body → ok:false (required XSS vector)", () => {
    const result = validateWhatsNewEntry(
      valid({ body: "<script>alert(1)</script>" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.body).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Multiple-error accumulation
// ---------------------------------------------------------------------------

describe("validateWhatsNewEntry — multiple field errors", () => {
  it("invalid emoji + invalid title + invalid body → all three errors present", () => {
    const result = validateWhatsNewEntry({
      emoji: "🎉🚀✨", // 3 code points
      title: "",
      body: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.emoji).toBeDefined();
      expect(result.errors.title).toBeDefined();
      expect(result.errors.body).toBeDefined();
    }
  });
});
