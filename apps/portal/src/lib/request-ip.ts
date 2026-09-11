import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";

/**
 * Extract the client IP from request headers.
 *
 * Precedence (DECISION-017):
 * 1. cf-connecting-ip — unconditionally trusted when present. Set by Cloudflare
 *    at the network edge; cannot be injected by clients on Cloudflare-fronted
 *    deployments. Absent when Cloudflare is not in the path (Vercel strips
 *    unrecognized headers).
 * 2. x-forwarded-for (first value) — consulted only when
 *    TRUST_PROXY_HEADERS=true. Spoofable without a controlled proxy chain;
 *    opt-in only.
 * 3. x-real-ip — Vercel's edge-set fallback. Absent in local dev.
 *
 * Returns null when no applicable header is present (local dev, scripts).
 *
 * Pass the result of `await headers()` (next/headers) or `request.headers`.
 *
 * Convention going forward: any module that needs the client IP imports this
 * function from @/lib/request-ip. Do not re-implement inline (DECISION-017).
 */
export function getRequestIp(hdrs: ReadonlyHeaders | Headers): string | null {
  const cfIp = hdrs.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  if (process.env.TRUST_PROXY_HEADERS === "true") {
    const xff = hdrs.get("x-forwarded-for");
    if (xff) {
      const first = xff.split(",")[0].trim();
      if (first) return first;
    }
  }

  const realIp = hdrs.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}
