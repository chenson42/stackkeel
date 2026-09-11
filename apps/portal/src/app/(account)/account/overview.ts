"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  users,
  userTotp,
  emailVerificationTokens,
  feedbackPromptState,
} from "@/lib/db/schema";
import { isFlagEnabled } from "@/lib/flags";

// Loads everything the account-settings dialog's sections need, in one round
// trip, when the dialog is OPENED (2026-09-05-account-menu-restructure
// Increment C).
//
// Fetching on open rather than in the layout is the point: the dialog is
// mounted in the header of every signed-in page, so eagerly loading five
// tables' worth of account state on every render — to serve a dialog most
// page views never open — would tax every request in the app. This is the
// same data the retired /account page fetched, just deferred.
export interface AccountOverview {
  name: string | null;
  /** users.email is notNull in the shared identity schema. */
  email: string;
  hasPassword: boolean;
  isEnrolledInTotp: boolean;
  pendingEmail: string | null;
  feedbackOptedOut: boolean;
  /** feedback.status_view (root DECISION-015) — gates the "My feedback"
   *  section. Folded into this one existing round trip rather than a
   *  separate prop, since AccountMenu has two call sites here (global-nav
   *  and (account)/layout.tsx) that would otherwise both need the same
   *  flag read. */
  feedbackStatusViewEnabled: boolean;
}

export async function getAccountOverview(): Promise<AccountOverview | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [
    userRow,
    totp,
    pendingToken,
    promptState,
    feedbackStatusViewEnabled,
  ] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { name: true, email: true, password: true },
    }),
    db.query.userTotp.findFirst({
      where: eq(userTotp.userId, session.user.id),
      columns: { userId: true },
    }),
    db.query.emailVerificationTokens.findFirst({
      where: eq(emailVerificationTokens.userId, session.user.id),
      columns: { newEmail: true },
    }),
    db.query.feedbackPromptState.findFirst({
      where: eq(feedbackPromptState.userId, session.user.id),
      columns: { optedOut: true },
    }),
    isFlagEnabled("feedback.status_view"),
  ]);

  if (!userRow) return null;

  return {
    name: userRow.name,
    email: userRow.email,
    hasPassword: userRow.password !== null,
    isEnrolledInTotp: !!totp,
    pendingEmail: pendingToken?.newEmail ?? null,
    feedbackOptedOut: promptState?.optedOut ?? false,
    feedbackStatusViewEnabled,
  };
}
