/**
 * Escape HTML special characters before interpolating user-supplied strings
 * into HTML email bodies. Required for all member-supplied strings in the
 * admin notification email (body, name, email, contextPath, appVersion).
 *
 * Escapes: & < > " '
 * This prevents XSS when member-controlled content is interpolated into
 * an HTML email template string.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
