import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";

/**
 * Extract the client IP from request headers. Copied verbatim from
 * apps/portal/src/lib/request-ip.ts (DECISION-017's precedent) — apps/*
 * are not workspace-consumable across sibling apps (only packages/* are),
 * so this is a deliberate, small, per-app duplication, same discipline as
 * apps/admin/src/lib/role-namespaces.ts's own hand-duplicated lists.
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
