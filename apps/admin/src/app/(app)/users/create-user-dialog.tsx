"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
} from "@repo/ui";
import { createUserAction } from "./actions";

type SignInMethod = "invite" | "google";

const EMPTY = { email: "", name: "", signInMethod: "invite" as SignInMethod };

export function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setValues(EMPTY);
      setError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const email = values.email.trim();
    if (!email || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    setPending(true);
    const result = await createUserAction({
      email,
      name: values.name.trim() || undefined,
      signInMethod: values.signInMethod,
    });
    setPending(false);

    if (!result.ok) {
      // Friendly duplicate-email message (or any other server-side
      // rejection) surfaces here verbatim — createUserAction never returns
      // a raw unique-constraint error.
      setError(result.error);
      return;
    }

    toast.success(
      values.signInMethod === "invite"
        ? "User created — invite email sent."
        : "User created — waiting for their first Google sign-in.",
    );
    handleOpenChange(false);
    router.push(`/users/${result.data!.userId}`);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="min-h-11">Create user</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            They start with no roles anywhere — grant access from their user page after
            creating them.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground"
            >
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="cu-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="cu-email"
              type="email"
              required
              autoFocus
              value={values.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              placeholder="person@example.org"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cu-name" className="text-sm font-medium">
              Name <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="cu-name"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder="Jordan Rivera"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Sign-in method</legend>
            <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent">
              <input
                type="radio"
                name="signInMethod"
                value="invite"
                checked={values.signInMethod === "invite"}
                onChange={() => setValues((v) => ({ ...v, signInMethod: "invite" }))}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium">Email invite</span>
                <span className="block text-xs text-muted-foreground">
                  Sends a link to set a password. Expires in 7 days.
                </span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent">
              <input
                type="radio"
                name="signInMethod"
                value="google"
                checked={values.signInMethod === "google"}
                onChange={() => setValues((v) => ({ ...v, signInMethod: "google" }))}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium">Google sign-in</span>
                <span className="block text-xs text-muted-foreground">
                  No email sent — activates the first time they sign in with Google.
                </span>
              </span>
            </label>
          </fieldset>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
              className="min-h-11"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending} className="min-h-11">
              {pending ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
