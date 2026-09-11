import { redirect } from "next/navigation";

// Retired 2026-09-05 (2026-09-05-account-menu-restructure Increment C).
// Account settings is a dialog opened from the profile menu in every
// signed-in header, not a page — Chris: "account settings should be a
// sharable dialog that pops up." Every section this page used to render now
// lives in src/components/shared/account-settings-content.tsx.
//
// Kept as a redirect rather than deleted so existing bookmarks and the
// revalidatePath("/account") calls still scattered through the account
// server actions resolve somewhere sensible instead of 404ing.
// /account/2fa is NOT retired: enrollment is a multi-step flow with a QR
// code and recovery codes, which the dialog links out to.
export default function AccountPage() {
  redirect("/home");
}
