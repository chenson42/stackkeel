"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label } from "@repo/ui";
import { toast } from "sonner";
import { saveReleasePolicy } from "./actions";

interface PolicyValues {
  minBuild: number | null;
  latestBuild: number | null;
  softMessage: string | null;
}

/**
 * Edit the single release-policy row. Raising min_build locks out every
 * older native install, so the submit copy names that consequence plainly
 * rather than burying it (UI-STANDARDS: destructive-adjacent actions are
 * labeled by consequence).
 */
export function ReleasePolicyForm({ initial }: { initial: PolicyValues }) {
  const [minBuild, setMinBuild] = useState(initial.minBuild?.toString() ?? "");
  const [latestBuild, setLatestBuild] = useState(initial.latestBuild?.toString() ?? "");
  const [softMessage, setSoftMessage] = useState(initial.softMessage ?? "");
  const [pending, startTransition] = useTransition();

  const parse = (v: string): number | null | undefined => {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : undefined;
  };

  return (
    <form
      className="mt-6 max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const min = parse(minBuild);
        const latest = parse(latestBuild);
        if (min === undefined || latest === undefined) {
          toast.error("Build numbers must be non-negative whole numbers.");
          return;
        }
        startTransition(async () => {
          const result = await saveReleasePolicy({
            minBuild: min,
            latestBuild: latest,
            softMessage: softMessage.trim() || null,
          });
          if (result.ok) toast.success("Release policy saved.");
          else toast.error(result.error);
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="latest-build">Latest build</Label>
        <Input
          id="latest-build"
          inputMode="numeric"
          value={latestBuild}
          onChange={(e) => setLatestBuild(e.target.value)}
          placeholder="e.g. 42 — blank disables the update nudge"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="min-build">Minimum build (hard block)</Label>
        <Input
          id="min-build"
          inputMode="numeric"
          value={minBuild}
          onChange={(e) => setMinBuild(e.target.value)}
          placeholder="blank disables the hard block"
        />
        <p className="text-xs text-muted-foreground">
          Installs below this build are blocked until they update. Raise with
          care.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="soft-message">Update banner message (optional)</Label>
        <Input
          id="soft-message"
          value={softMessage}
          onChange={(e) => setSoftMessage(e.target.value)}
          maxLength={500}
          placeholder="Shown with the update nudge"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save policy"}
      </Button>
    </form>
  );
}
