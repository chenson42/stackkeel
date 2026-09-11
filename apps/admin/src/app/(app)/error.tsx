"use client";

import { Button } from "@repo/ui";

// Friendly error boundary for /users, /users/[id], /requests — human
// microcopy instead of Next's default raw error overlay, per the "error
// (human microcopy, not a raw error)" required UI state. `reset()` retries
// the segment's render without a full page reload.
export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This page couldn&apos;t load. Nothing was changed — try again, and if it keeps
        happening, let another Admin admin know.
      </p>
      <Button type="button" onClick={() => reset()} className="mt-6">
        Try again
      </Button>
    </div>
  );
}
