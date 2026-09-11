"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function EmailVerifyError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[email-verify] unhandled error", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <h2 className="text-2xl font-semibold">Something went wrong</h2>
      <p className="mt-4 text-sm text-muted-foreground">
        We couldn&apos;t complete your email verification. This is on our end
        &mdash; your link may have already been used, or try again in a moment.
      </p>
      <Link
        href="/signin"
        className="mt-6 inline-block text-sm underline underline-offset-2"
      >
        Return to sign in
      </Link>
    </main>
  );
}
