import { test, expect } from "@playwright/test";
import { MEMBER_EMAIL, MEMBER_PASSWORD } from "./support/global-setup";

// Unauthenticated flows — no storageState.

test("signin page renders the credentials form", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("unauthenticated /home redirects to signin with callbackUrl", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fhome/);
});

test("wrong password shows a generic error (no enumeration)", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(MEMBER_EMAIL);
  await page.getByLabel("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  const text = (await alert.textContent()) ?? "";
  // Must not reveal whether the account exists.
  expect(text.toLowerCase()).not.toContain("no account");
  expect(text.toLowerCase()).not.toContain("unknown user");
});

test("credentials login lands on /home via /launch", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(MEMBER_EMAIL);
  await page.getByLabel("Password").fill(MEMBER_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/home$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
});
