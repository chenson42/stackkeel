import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // TODO: When moving to an enforced CSP, drop this header in favor of `frame-ancestors` in the
  // CSP directive. `frame-ancestors` supersedes X-Frame-Options in modern browsers; the current
  // report-only CSP creates no conflict, but an enforced `frame-ancestors 'none'` and this header
  // contradict each other. Drop X-Frame-Options at enforcement time.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    // preload intentionally omitted — submitting to the browser preload list is effectively
    // irreversible at the domain level; add it only after the domain DNS is stable and all
    // subdomains serve HTTPS.
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    // Fork-tightening path (four steps):
    // 1. Deploy report-only. Observe violations in devtools or a report-uri aggregation endpoint.
    //    To collect violations server-side, add `report-uri /api/csp-report` to the value below
    //    and create a matching route handler at src/app/api/csp-report/route.ts.
    // 2. Narrow directives based on observed violations. For any new external script or font, add
    //    the domain explicitly rather than keeping 'unsafe-inline'.
    // 3. Add nonce generation in src/proxy.ts (or middleware.ts) and pass the nonce to <Script>
    //    components. Remove 'unsafe-inline' from script-src.
    // 4. Rename this header key from Content-Security-Policy-Report-Only to
    //    Content-Security-Policy.
    //
    // Dev note: the Next.js HMR WebSocket (ws://localhost:<port>/_next/webpack-hmr) generates
    // connect-src violation noise in devtools during `npm run dev`. This is expected; ignore it.
    // A future enforced CSP will need `ws://localhost:<port>` in connect-src for dev builds.
    // Cloudflare Turnstile: remove https://challenges.cloudflare.com from script-src
    // and restore frame-src 'none' if not using NEXT_PUBLIC_TURNSTILE_SITE_KEY.
    //
    // connect-src does NOT include Cloudflare: the Turnstile iframe's outbound
    // fetches are governed by the iframe's own CSP (set by Cloudflare), not the
    // parent page's connect-src. Parent JS does not XHR to Cloudflare directly.
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://lh3.googleusercontent.com; font-src 'self'; connect-src 'self'; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
  {
    // Portal is an internal staff and volunteer tool — it should never appear
    // in a search index, including its sign-in page. public/robots.txt asks
    // crawlers not to look; this header is what actually keeps a page out of
    // an index, applies to every response (redirects and non-HTML included),
    // and does not depend on the crawler having read robots.txt first.
    //
    // Added 2026-09-06. Until then Portal shipped the upstream starter's
    // `Allow: /` robots.txt and no header at all — it was the only one of the
    // an app actively inviting crawlers. Matches the predecessors' long-standing
    // configuration.
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
  // Dev server only — allows cross-origin asset requests from Cloudflare tunnels used in local
  // dev (`cloudflared tunnel --url localhost:3000`). Remove if your fork does not use Cloudflare
  // tunnels.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
