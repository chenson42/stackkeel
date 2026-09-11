import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppBadge } from "@repo/ui";
import { sanitizeCallbackUrl } from "@/lib/auth/safe-callback";
import { ChangePasswordForm } from "./change-password-form";

// Forced-password-change gate destination. A user whose row carries
// mustChangePassword (first login on an invited account, or an operator
// reset) is redirected here by proxy.ts and by the shared post-sign-in
// resolver, and cannot reach any other signed-in route until the change
// succeeds (the action clears the flag; the JWT picks it up next request).
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const params = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(params.callbackUrl ?? "/home");
  if (!session.user.mustChangePassword) redirect(callbackUrl);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        <AppBadge app="portal" />
        <h1 className="mt-4 text-xl font-semibold">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your password must be changed before you continue.
        </p>
        <div className="mt-6">
          <ChangePasswordForm callbackUrl={callbackUrl} />
        </div>
      </div>
    </main>
  );
}
