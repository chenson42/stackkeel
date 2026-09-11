"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@repo/ui";

/** URL-state email filter (?user=) — same pattern as /tickets' filters. */
export function UserFilterForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);

  return (
    <form
      className="mt-4 flex max-w-md items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (value.trim()) params.set("user", value.trim());
        router.push(params.size ? `/devices?${params}` : "/devices");
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Filter by owner email…"
        aria-label="Filter devices by owner email"
      />
      <Button type="submit" variant="outline" size="sm">
        Filter
      </Button>
    </form>
  );
}
