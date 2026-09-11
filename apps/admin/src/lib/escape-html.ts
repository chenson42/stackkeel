/**
 * Escape HTML special characters before interpolating user-supplied strings
 * into HTML email bodies. Copied verbatim from
 * apps/portal/src/lib/email/escape-html.ts — required by
 * apps/portal/CLAUDE.md's invariant ("HTML-escape user-controlled strings
 * before interpolating into email HTML," the an earlier project lesson) for
 * any admin-supplied display name interpolated into the invite email.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
