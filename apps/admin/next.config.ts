import type { NextConfig } from "next";

// Mirrors apps/portal/next.config.ts's security-header set verbatim
// (apps/admin scaffolds off Portal's precedent.)
// See that file for the full rationale on each header and the fork-
// tightening path for the report-only CSP.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    // See apps/portal/next.config.ts's own comment block for the full
    // fork-tightening path (report-only -> nonce-based enforced CSP).
    // img-src includes Google's avatar host since this app also offers
    // Google OAuth (DECISION-054 point 3).
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://lh3.googleusercontent.com; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
  {
    // The admin app is the cross-app control plane and is admin-only on every
    // route — it should never appear in a search index, including its sign-in
    // page. public/robots.txt asks crawlers not to look; this header is what
    // actually keeps a page out of an index, applies to every response
    // (redirects and non-HTML included), and does not depend on the crawler
    // having read robots.txt first. Added 2026-09-06 — before then this app
    // had neither. Matches the predecessors' long-standing configuration.
    key: "X-Robots-Tag",
    value: "noindex, nofollow",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
