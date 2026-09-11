"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users, inviteTokens } from "@/lib/db/schema";
import { FEATURES, hasFeature } from "@repo/permissions";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { mintAndSendInvite } from "@/lib/invite";
import type { ActionResult } from "@/types/actions";

async function requireAdminUsers() {
  const session = await auth();
  if (!session?.user || !hasFeature(session.user.features, FEATURES.ADMIN_USERS)) {
    return null;
  }
  return session;
}

// ---------------------------------------------------------------------------
// createUserAction — Phase 3 API Contract.
// ---------------------------------------------------------------------------

export async function createUserAction(input: {
  email: string;
  name?: string;
  signInMethod: "invite" | "google";
}): Promise<ActionResult<{ userId: string }>> {
  const session = await requireAdminUsers();
  if (!session) return { ok: false, error: "Forbidden." };

  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "Email is required." };

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  });
  if (existing) {
    // Flow 1's named failure case — friendly message, not a raw
    // unique-constraint error.
    return { ok: false, error: "An account with this email already exists." };
  }

  const [created] = await db
    .insert(users)
    .values({ email, name: input.name?.trim() || null, accountStatus: "invited" })
    .returning({ id: users.id });

  await recordAudit({
    action: AUDIT_ACTIONS.ADMIN_USER_CREATED,
    resourceType: "user",
    resourceId: created.id,
    metadata: { email, signInMethod: input.signInMethod },
  });

  if (input.signInMethod === "invite") {
    await mintAndSendInvite({ userId: created.id, email, recipientName: input.name });
    await recordAudit({
      action: AUDIT_ACTIONS.ADMIN_INVITE_SENT,
      resourceType: "user",
      resourceId: created.id,
      metadata: { email },
    });
  }
  // signInMethod === "google": no token minted — the row waits for a first
  // Google sign-in, which apps/admin/src/auth.ts's signIn callback flips to
  // accountStatus 'active' (DECISION-055 point 4).

  revalidatePath("/users");
  return { ok: true, data: { userId: created.id } };
}

// ---------------------------------------------------------------------------
// resendInviteAction — Phase 3 API Contract.
// ---------------------------------------------------------------------------

export async function resendInviteAction(input: {
  userId: string;
}): Promise<ActionResult> {
  const session = await requireAdminUsers();
  if (!session) return { ok: false, error: "Forbidden." };

  const target = await db.query.users.findFirst({
    where: eq(users.id, input.userId),
    columns: { id: true, email: true, name: true, accountStatus: true },
  });
  if (!target) return { ok: false, error: "User not found." };
  if (target.accountStatus !== "invited") {
    return { ok: false, error: "This user doesn't have a pending invite to resend." };
  }

  // A user invited via the Google-OAuth-pre-authorized path never had a
  // token minted (createUserAction above) — the presence of a row here is
  // how this app infers "this user's chosen sign-in method was invite,"
  // since accountStatus alone can't distinguish the two pending states.
  const existingToken = await db.query.inviteTokens.findFirst({
    where: eq(inviteTokens.userId, target.id),
    columns: { userId: true },
  });
  if (!existingToken) {
    return { ok: false, error: "This user doesn't have a pending invite to resend." };
  }

  await mintAndSendInvite({ userId: target.id, email: target.email, recipientName: target.name });
  await recordAudit({
    action: AUDIT_ACTIONS.ADMIN_INVITE_SENT,
    resourceType: "user",
    resourceId: target.id,
    metadata: { email: target.email, resend: true },
  });

  revalidatePath(`/users/${target.id}`);
  return { ok: true };
}
