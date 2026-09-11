import { test, expect } from "@playwright/test";

test("security headers are present on /signin", async ({ request, baseURL }) => {
  const res = await request.get(`${baseURL}/signin`);
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(res.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("/api/health reports ok with the db up", async ({ request, baseURL }) => {
  const res = await request.get(`${baseURL}/api/health`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { ok: boolean; db: string; version: string };
  expect(body.ok).toBe(true);
  expect(body.db).toBe("up");
  expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
});
