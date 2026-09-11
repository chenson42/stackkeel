"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@repo/ui";
import { updateProfile } from "./actions";

export function ProfileForm({ name }: { name: string | null }) {
  const [value, setValue] = useState(name ?? "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) {
      toast.error("Name cannot be blank.");
      return;
    }
    setPending(true);
    const result = await updateProfile({ name: value });
    setPending(false);
    if (result.ok) {
      toast.success("Name updated.");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <div>
        <label htmlFor="display-name" className="block text-sm font-medium">
          Display name
        </label>
        <input
          id="display-name"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={100}
          required
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Your name"
        />
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground text-background hover:bg-foreground/90"
      >
        {pending ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}
