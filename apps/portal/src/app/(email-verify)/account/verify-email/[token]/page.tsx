// This page is intentionally reachable without an active session.
// The proxy grants access to /account/verify-email/* without authentication.
// See src/proxy.ts for the prefix exception.
//
// This page lives in the (email-verify) route group, which has NO layout.
// Moving it here (away from the (account) route group) prevents the (account)
// layout's auth() + redirect from firing for unauthenticated visitors who
// click a verification link in a fresh browser session.

import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, emailVerificationTokens, auditEvents } from "@/lib/db/schema";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db/errors";
import { revalidatePath } from "next/cache";
import Link from "next/link";

function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

interface Props {
  params: Promise<{ token: string }>;
}

export default async function VerifyEmailPage({ params }: Props) {
  const { token } = await params;

  // The URL carries the raw token; the DB stores only its SHA-256 hash.
  // Hash the inbound value before lookup — a DB read cannot forge a link.
  const tokenHash = sha256Hex(token);

  const tokenRow = await db.query.emailVerificationTokens.findFirst({
    where: eq(emailVerificationTokens.token, tokenHash),
  });

  if (!tokenRow) {
    return <ErrorCard message="This verification link is invalid or has already been used." />;
  }

  if (tokenRow.expiresAt < new Date()) {
    // Clean up expired row
    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.id, tokenRow.id));
    return <ErrorCard message="This verification link has expired. Request a new one from your account settings." />;
  }

  // Fetch the user's current email for the audit record before we change it
  const userRow = await db.query.users.findFirst({
    where: eq(users.id, tokenRow.userId),
    columns: { email: true },
  });

  if (!userRow) {
    return <ErrorCard message="Account not found." />;
  }

  const oldEmail = userRow.email;
  const newEmail = tokenRow.newEmail;

  // Apply the email change atomically.
  // The Neon HTTP driver has no interactive db.transaction(); db.batch()
  // runs all three statements as a single server-side transaction.
  // See docs/decisions.md DECISION-014.
  //
  // A 23505 unique-constraint violation can occur here if two users concurrently
  // verify tokens that both target the same email address (TOCTOU on the
  // requestEmailChange check). Catch it and return a friendly ErrorCard instead
  // of an unhandled 500. Any other error is re-thrown.
  try {
    await db.batch([
      db
        .update(users)
        .set({ email: newEmail })
        .where(eq(users.id, tokenRow.userId)),
      db
        .delete(emailVerificationTokens)
        .where(eq(emailVerificationTokens.id, tokenRow.id)),
      db.insert(auditEvents).values({
        actorUserId: tokenRow.userId,
        actorEmail: newEmail,
        action: AUDIT_ACTIONS.USER_EMAIL_CHANGED,
        resourceType: "user",
        resourceId: tokenRow.userId,
        metadata: { oldEmail, newEmail },
      }),
    ] as unknown as Parameters<typeof db.batch>[0]);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      return (
        <ErrorCard message="This email address has already been claimed by another account. Request a new verification link from your account settings." />
      );
    }
    throw err;
  }

  revalidatePath("/account");

  // Redirect to account page with a success flag; the page will show a toast.
  redirect("/account?emailChanged=1");
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Email verification failed</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        <Link
          href="/home"
          className="mt-6 inline-block rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Back to account settings
        </Link>
      </div>
    </div>
  );
}
