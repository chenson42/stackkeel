import { describe, it, expect, vi, afterEach } from "vitest";

// Must be imported after vi.mock calls if they were needed; here we use
// vi.stubEnv and vi.stubGlobal for isolation.

// Dynamic import so we can re-import a fresh module after env changes within
// the same test run. Because "server-only" throws outside Node server context,
// we mock it.
vi.mock("server-only", () => ({}));

// Import after the mock.
const { verifyTurnstile } = await import("./turnstile");

const mockFetch = vi.fn();

afterEach(() => {
  mockFetch.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubFetchSuccess(success: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success }),
    }),
  );
}

describe("verifyTurnstile", () => {
  // -------------------------------------------------------------------------
  // No-op paths (no secret key configured)
  // -------------------------------------------------------------------------

  it("returns true when TURNSTILE_SECRET_KEY is unset and token is undefined", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const result = await verifyTurnstile(undefined);
    expect(result).toBe(true);
  });

  it("returns true when TURNSTILE_SECRET_KEY is unset and token is provided", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const result = await verifyTurnstile("some-token");
    expect(result).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Token-absent paths (secret key configured, no valid token)
  // -------------------------------------------------------------------------

  it("returns false when TURNSTILE_SECRET_KEY is set and token is undefined", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    const result = await verifyTurnstile(undefined);
    expect(result).toBe(false);
  });

  it("returns false when TURNSTILE_SECRET_KEY is set and token is null", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    const result = await verifyTurnstile(null);
    expect(result).toBe(false);
  });

  it("returns false when TURNSTILE_SECRET_KEY is set and token is empty string", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    const result = await verifyTurnstile("");
    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Siteverify response paths
  // -------------------------------------------------------------------------

  it("returns true when siteverify responds with { success: true }", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    stubFetchSuccess(true);
    const result = await verifyTurnstile("valid-token");
    expect(result).toBe(true);
  });

  it("returns false when siteverify responds with { success: false }", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    stubFetchSuccess(false);
    const result = await verifyTurnstile("invalid-token");
    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Fail-open (DECISION-026)
  // -------------------------------------------------------------------------

  it("returns true (fail-open) when fetch throws", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );
    const result = await verifyTurnstile("some-token");
    expect(result).toBe(true);
  });

  // -------------------------------------------------------------------------
  // IP hint threading
  // -------------------------------------------------------------------------

  it("includes remoteip in the siteverify request body when ip is provided", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstile("valid-token", "1.2.3.4");
    expect(result).toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0];
    const body = options.body as URLSearchParams;
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });
});
