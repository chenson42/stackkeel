import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sanitizeCallbackUrl } from "@/lib/auth/safe-callback";
import { resolveLaunchDestination } from "./destination";

// See destination.ts — this page is a pure redirect with no UI.
export default async function LaunchPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  redirect(
    resolveLaunchDestination(
      session?.user ?? null,
      sanitizeCallbackUrl(params.callbackUrl),
    ),
  );
}
