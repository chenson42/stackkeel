// packages/auth/src/safe-callback.ts
//
// One shared open-redirect validator. The naive
// `startsWith("/") && !startsWith("//")` check every app tends to write is
// not enough — some browsers/URL parsers treat a leading "\" the same as
// "/", so "/\evil.example" slips past (it does start with "/", and does NOT
// start with "//") and can resolve off-origin once the parser normalizes
// the backslash. Closed here, once, for every app.

/**
 * Validates that a callbackUrl is a safe same-origin relative path, and
 * closes the backslash-variant open-redirect gap: some browsers/URL parsers
 * treat a leading "\" the same as "/", so "/\evil.example" would otherwise
 * slip past a naive `!raw.startsWith("//")` check and resolve off-origin.
 *
 * `fallback` is REQUIRED (not baked in) because apps legitimately disagree
 * on it (portal "/home", admin "/users") — each app keeps its own thin
 * single-argument wrapper delegating here with its own fallback value.
 *
 * Deliberately does NOT return the backslash-normalized string on the
 * accept path — this function is a validator, not a transformer. A raw
 * value that passes every check (no leading "\", no "//" after
 * normalization) is returned exactly as given.
 */
export function sanitizeCallbackUrl(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  const normalized = raw.replace(/\\/g, "/");
  if (normalized.startsWith("//")) return fallback;
  return raw;
}
