"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@repo/ui";
import { regenerateRecoveryCodes } from "./actions";

export function RegenerateCodesForm() {
  const [pending, setPending] = useState(false);
  const [freshCodes, setFreshCodes] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await regenerateRecoveryCodes();
    setPending(false);
    if (result.ok && result.data) {
      setFreshCodes(result.data.recoveryCodes);
    } else if (!result.ok) {
      toast.error(result.error);
    }
  }

  if (freshCodes.length > 0) {
    return (
      <div className="mt-3">
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            New recovery codes — save these now
          </h3>
          <p className="mt-1 text-xs">
            Your old codes are no longer valid. Each new code can be used once.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
            {freshCodes.map((c) => (
              <li key={c} className="rounded bg-background px-2 py-1">
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3">
      <Button
        type="submit"
        disabled={pending}
        variant="outline"
        size="sm"
        className="rounded-md hover:bg-muted hover:text-foreground"
      >
        {pending ? "Regenerating…" : "Regenerate recovery codes"}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        Replaces every existing code. The new set is shown once — save them
        before leaving the page.
      </p>
    </form>
  );
}
