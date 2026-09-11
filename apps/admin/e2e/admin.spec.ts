import { test, expect } from "@playwright/test";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { ADMIN_EMAIL, MEMBER_EMAIL } from "./support/global-setup";

// Signed-in admin flows via the TOTP-verified storageState from global-setup.
test.use({ storageState: path.resolve(__dirname, "support/.auth/admin.json") });

test("/users lists the seeded users", async ({ page }) => {
  await page.goto("/users");
  await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
  await expect(page.getByText(MEMBER_EMAIL)).toBeVisible();
});

test("role toggle round-trip writes audit rows", async ({ page }) => {
  // Open the seeded member's detail page from the users list.
  await page.goto("/users");
  await page.getByRole("link", { name: new RegExp(MEMBER_EMAIL) }).click();
  await expect(page).toHaveURL(/\/users\/[0-9a-f-]+$/);

  // The role checkboxes carry accessible names "{app} — {level}".
  const memberBox = page
    .getByRole("checkbox", { name: /member/i })
    .first();
  await expect(memberBox).toBeVisible();
  const wasChecked = await memberBox.isChecked();

  // Toggle away and back — each direction is an immediate server action.
  await memberBox.click();
  await expect(
    page.getByText(wasChecked ? "Role revoked." : "Role granted.").first(),
  ).toBeVisible({ timeout: 10_000 });
  await memberBox.click();
  await expect(
    page.getByText(wasChecked ? "Role granted." : "Role revoked.").first(),
  ).toBeVisible({ timeout: 10_000 });

  // The mutations must have audited — verify directly in the database.
  const sql = neon(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL!);
  const rows = (await sql`
    SELECT action FROM audit_events
    WHERE action IN ('admin.role.granted', 'admin.role.revoked')
      AND created_at > now() - interval '2 minutes'
  `) as Array<{ action: string }>;
  expect(rows.length).toBeGreaterThanOrEqual(2);
});
