import { test, expect } from "@playwright/test";
import { FRESH_ADMIN_EMAIL, FRESH_ADMIN_PASSWORD } from "./support/global-setup";

// Unauthenticated + enrollment-gate flows — no storageState.

test("unauthenticated /users redirects to signin", async ({ page }) => {
  await page.goto("/users");
  await expect(page).toHaveURL(/\/signin/);
});

test("admin without TOTP enrollment is forced to /setup-mfa", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(FRESH_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(FRESH_ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  // The edge gate owns this redirect: authenticated, admin role, no TOTP.
  await expect(page).toHaveURL(/\/setup-mfa/, { timeout: 15_000 });
});
