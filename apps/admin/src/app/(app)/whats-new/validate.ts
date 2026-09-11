/**
 * Pure validation helper for What's-new entry fields.
 * Zero dependencies on DB or auth — fully unit-testable.
 *
 * Rules (all are HARD REQUIREMENTS from Phase 2 Ruling 6):
 *   emoji:  optional; if non-empty, [...emoji].length <= 2 (Unicode code-point spread)
 *   title:  required; <= 100 chars; plain text only (no HTML tags)
 *   body:   required; <= 500 chars; plain text only (no HTML tags)
 *
 * HTML rejection: /<[^>]+>/ — matches any string containing an HTML-like tag
 * structure. Rule: REJECT (return validation error) not strip.
 */

export type WhatsNewValidationInput = {
  emoji: string; // may be empty string (optional field)
  title: string;
  body: string;
};

export type WhatsNewValidationResult =
  | { ok: true }
  | { ok: false; errors: Partial<Record<keyof WhatsNewValidationInput, string>> };

// Matches any string containing an HTML-like tag structure.
// Catches <script>alert(1)</script>, <b>, <img src>, </p>, etc.
const HTML_TAG_RE = /<[^>]+>/;

export function validateWhatsNewEntry(
  data: WhatsNewValidationInput,
): WhatsNewValidationResult {
  const errors: Partial<Record<keyof WhatsNewValidationInput, string>> = {};

  // emoji: optional, but if non-empty, must be <= 2 Unicode code points.
  // Use [...spread] NOT .length — multi-codepoint glyphs (family emoji,
  // skin-tone modifiers) have .length >> 2 but look like 1 character.
  if (data.emoji.trim().length > 0) {
    if ([...data.emoji.trim()].length > 2) {
      errors.emoji = "Emoji must be 2 characters or fewer.";
    }
  }

  // title: required, <= 100 chars, plain text only
  if (data.title.trim().length === 0) {
    errors.title = "Title is required.";
  } else if (data.title.length > 100) {
    errors.title = "Title must be 100 characters or fewer.";
  } else if (HTML_TAG_RE.test(data.title)) {
    errors.title = "Title must be plain text — HTML is not allowed.";
  }

  // body: required, <= 500 chars, plain text only
  if (data.body.trim().length === 0) {
    errors.body = "Body is required.";
  } else if (data.body.length > 500) {
    errors.body = "Body must be 500 characters or fewer.";
  } else if (HTML_TAG_RE.test(data.body)) {
    errors.body = "Body must be plain text — HTML is not allowed.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}
