/**
 * Pure URL → in-app path translation for deep links (module `mobile`).
 * Extracted from MobileDeepLinkHandler for unit testing.
 *
 * Accepts both custom-scheme links (stackkeel://support/123) and https
 * universal links (https://app.example.com/support/123); returns the in-app
 * path + query + hash, or null for anything that should NOT be routed
 * (foreign hosts, malformed URLs, other schemes).
 */
export function deepLinkToPath(
  rawUrl: string,
  appScheme: string,
  webOrigin: string | null,
): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const scheme = url.protocol.replace(/:$/, "");
  const wanted = appScheme.replace(/:\/\/$/, "").replace(/:$/, "");

  if (scheme === wanted) {
    // Custom scheme: "stackkeel://support/123?x=1" parses with host
    // "support" and pathname "/123" — the host is really the first path
    // segment, so stitch it back on.
    const host = url.host;
    const path = `/${host}${url.pathname}`.replace(/\/+$/, "") || "/";
    return `${path}${url.search}${url.hash}`;
  }

  if ((scheme === "https" || scheme === "http") && webOrigin) {
    try {
      const origin = new URL(webOrigin).origin;
      if (url.origin === origin) return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }
  return null;
}
