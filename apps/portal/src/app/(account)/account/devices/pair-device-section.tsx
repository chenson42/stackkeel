"use client";

import { useState, useTransition } from "react";
import { Button } from "@repo/ui";
import { toast } from "sonner";
import { createPairingCode } from "./actions";

/**
 * Mint-and-display a 6-digit pairing code. The code is shown ONCE (it is
 * stored hashed); it expires in 10 minutes and burns on first use. Display
 * groups the digits "123 456" for readability — the app strips whitespace.
 */
export function PairDeviceSection() {
  const [code, setCode] = useState<{ value: string; expiresAt: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section
      className="mt-6 rounded-lg border bg-muted/30 p-4"
      aria-label="Pair a mobile device"
    >
      <h2 className="text-sm font-semibold">Pair the mobile app</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Generate a one-time code, then enter it in the mobile app&apos;s pairing
        screen. Codes expire after 10 minutes.
      </p>
      {code ? (
        <div className="mt-3 space-y-1">
          <p
            className="font-mono text-3xl font-semibold tracking-widest"
            aria-label="Pairing code"
          >
            {code.value.slice(0, 3)} {code.value.slice(3)}
          </p>
          <p className="text-xs text-muted-foreground">
            Shown once — it isn&apos;t stored anywhere you can look it up later.
          </p>
        </div>
      ) : (
        <Button
          className="mt-3"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await createPairingCode();
              if (result.ok && result.data) {
                setCode({ value: result.data.code, expiresAt: result.data.expiresAt });
              } else if (!result.ok) {
                toast.error(result.error);
              }
            })
          }
        >
          {pending ? "Generating…" : "Generate pairing code"}
        </Button>
      )}
    </section>
  );
}
