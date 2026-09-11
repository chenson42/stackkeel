"use client";

import { useRouter } from "next/navigation";
import { ChangePasswordSection } from "@repo/ui";
import { changePassword } from "@/app/(account)/account/actions";

export function ChangePasswordForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  return (
    <ChangePasswordSection
      onSubmit={async (input) => {
        const result = await changePassword(input);
        if (!result.ok) return { error: result.error };
        // The action cleared mustChangePassword; a hard navigation lets the
        // JWT refresh see the new value before the proxy re-evaluates.
        router.push(callbackUrl);
        router.refresh();
      }}
    />
  );
}
