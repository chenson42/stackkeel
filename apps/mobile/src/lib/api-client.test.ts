import { describe, it, expect, vi } from "vitest";
import { request, type ApiDeps } from "./api-client";

// Typed with fetch's real parameter shape so mock.calls[n] carries the
// (url, init) tuple type instead of [].
const typedFetchMock = (impl: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) =>
  vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(impl);

function makeDeps(overrides: Partial<ApiDeps> = {}): ApiDeps & { revoked: () => number } {
  let revokedCount = 0;
  return {
    fetchImpl: typedFetchMock(async () => new Response(JSON.stringify({}), { status: 200 })),
    getToken: async () => "tok-123",
    onRevoked: () => {
      revokedCount++;
    },
    baseUrl: "https://portal.example.com",
    revoked: () => revokedCount,
    ...overrides,
  };
}

describe("api-client request", () => {
  it("attaches the bearer token and parses success JSON", async () => {
    const fetchImpl = typedFetchMock(
      async () => new Response(JSON.stringify({ id: "u1" }), { status: 200 }),
    );
    const deps = makeDeps({ fetchImpl });
    const result = await request<{ id: string }>("GET", "/api/me", undefined, {}, deps);
    expect(result).toEqual({ ok: true, status: 200, data: { id: "u1" } });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://portal.example.com/api/me");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("omits auth when unauthenticated and sends Idempotency-Key", async () => {
    const fetchImpl = typedFetchMock(async () => new Response("{}", { status: 201 }));
    const deps = makeDeps({ fetchImpl });
    await request("POST", "/api/devices", { platform: "ios" }, {
      unauthenticated: true,
      idempotencyKey: "k1",
    }, deps);
    const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Idempotency-Key"]).toBe("k1");
  });

  it("maps {reason} error bodies and fires the revocation bus on device_revoked", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn(
        async () => new Response(JSON.stringify({ reason: "device_revoked" }), { status: 401 }),
      ),
    });
    const result = await request("GET", "/api/me", undefined, {}, deps);
    expect(result).toEqual({ ok: false, status: 401, reason: "device_revoked" });
    expect(deps.revoked()).toBe(1);
  });

  it("does NOT fire the bus on a plain 401", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn(
        async () => new Response(JSON.stringify({ reason: "unauthorized" }), { status: 401 }),
      ),
    });
    const result = await request("GET", "/api/me", undefined, {}, deps);
    expect(result).toEqual({ ok: false, status: 401, reason: "unauthorized" });
    expect(deps.revoked()).toBe(0);
  });

  it("maps fetch throws to network_error and unparseable bodies to unknown_error", async () => {
    const throwing = makeDeps({
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    expect(await request("GET", "/x", undefined, {}, throwing)).toEqual({
      ok: false,
      status: 0,
      reason: "network_error",
    });

    const html = makeDeps({
      fetchImpl: vi.fn(async () => new Response("<html>", { status: 500 })),
    });
    expect(await request("GET", "/x", undefined, {}, html)).toEqual({
      ok: false,
      status: 500,
      reason: "unknown_error",
    });
  });
});
