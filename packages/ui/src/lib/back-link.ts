// Pure prefix-match helper backing the shared `<BackLink>` component
// (2026-09-07-back-nav-and-shell-consistency, Phase 3 § 1, Increment 1).
// No React import — works identically from a Server Component page
// (Portal's tasks/[id], a `searchParams` prop) or a Client Component page
// (one predecessor app's participants/[id], `useSearchParams()`) since it only ever
// receives a plain string.
//
// This is the real allowlist `UI-STANDARDS.md`'s own Back Navigation
// example stood in for with a single `.startsWith()` against one hardcoded
// prefix — Phase 3 supersedes that example (root CLAUDE.md's binding
// instruction for this increment); the doc itself gets corrected in
// Increment 6, not here.

export interface BackLinkRoute {
  /** Path prefix an incoming `from` value must match — exact, or followed
   *  by "/" or "?". Not a bare substring check (UI-STANDARDS.md's own
   *  in-file example at line 234-237 does a single `.startsWith()` against
   *  one hardcoded prefix; this is the real multi-entry allowlist it was a
   *  stand-in for). */
  prefix: string;
  /** Bare destination name, e.g. "Participants" — this function prepends
   *  "Back to " once, here, so no call site re-derives its own copy. */
  name: string;
}

export interface BackLinkFallback {
  href: string;
  name: string;
}

/**
 * Resolves an untrusted `from` query value against a per-app allowlist.
 *
 * Open-redirect guard: `isPathOnly` rejects any `from` that doesn't start
 * with `/` (kills absolute URLs — `https://evil.example/...`) and rejects a
 * leading `//` (kills protocol-relative URLs — `//evil.example/...`, which
 * `startsWith("/")` alone would wrongly accept). Only a value that then also
 * matches a table entry's prefix is trusted; everything else — absent,
 * malformed, off-allowlist, same-origin-but-unlisted — falls through to
 * `fallback`, which is always a real `{href, name}` pair, never a bare
 * "Back".
 */
export function resolveBackLink(
  from: string | null | undefined,
  table: readonly BackLinkRoute[],
  fallback: BackLinkFallback,
): { href: string; label: string } {
  const isPathOnly = !!from && from.startsWith("/") && !from.startsWith("//");
  const match = isPathOnly
    ? table.find(
        (r) =>
          from === r.prefix ||
          from!.startsWith(`${r.prefix}/`) ||
          from!.startsWith(`${r.prefix}?`),
      )
    : undefined;

  const { href, name } = match ? { href: from as string, name: match.name } : fallback;
  return { href, label: `Back to ${name}` };
}
