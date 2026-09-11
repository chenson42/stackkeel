import { redirect } from "next/navigation";
import { sanitizeCallbackUrl } from "@/lib/auth/safe-callback";

// Stable alias target for the shared post-sign-in resolver
// (@repo/auth resolvePortalPostSignInDestination → "/account/2fa/setup").
// The actual enrollment UI lives one level up at /account/2fa; this route
// exists so the resolver's contract names a real page and the callbackUrl
// survives the hop.
export default async function TwoFactorSetupRedirect({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(params.callbackUrl ?? "/home");
  redirect(`/account/2fa?callbackUrl=${encodeURIComponent(callbackUrl)}`);
}
