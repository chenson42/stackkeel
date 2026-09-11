import { test, expect } from "@playwright/test";
import path from "node:path";

// Signed-in member flows, via the cached storageState from global-setup.
test.use({ storageState: path.resolve(__dirname, "support/.auth/member.json") });

test("/home renders the member shell", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
});

test("/account redirects home (dialog model) and /account/2fa renders", async ({ page }) => {
  // Account settings is a dialog, not a page — the retired /account route
  // deliberately redirects to /home (see (account)/account/page.tsx). The
  // multi-step 2FA enrollment flow is the part that stays a real route.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/account/2fa");
  await expect(page).toHaveURL(/\/account\/2fa$/);
  await expect(page.getByRole("heading", { name: /two-factor|2fa/i }).first()).toBeVisible();
});

test("filing a support ticket shows it in My tickets", async ({ page }) => {
  const subject = `e2e smoke ticket ${Date.now()}`;
  await page.goto("/support");
  await expect(page.getByRole("form", { name: "File a support ticket" })).toBeVisible();
  await page.getByLabel("Subject").fill(subject);
  await page.getByLabel("What happened?").fill("Automated smoke test ticket body.");
  await page.getByRole("button", { name: /file ticket/i }).click();
  // The route announcer duplicates page text — scope to the main region.
  await expect(
    page.getByRole("main").getByText(subject).first(),
  ).toBeVisible({ timeout: 10_000 });
});
