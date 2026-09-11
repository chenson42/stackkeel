"use server";

import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { users, inviteTokens } from "@/lib/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { getRequestIp } from "@/lib/request-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/types/actions";

function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * consumeInviteTokenAction — public (unauthenticated), backs /set-password.
 * Mirrors apps/portal/src/app/(password-reset)/actions.ts's consumeResetToken
 * shape exactly (Phase 3 API Contract): TOCTOU-safe atomic
 * DELETE...RETURNING claim, SHA-256-hex token lookup, bcrypt password hash,
 * IP rate limit since this is a public URL even though it's admin-initiated
 * rather than self-serve.
 *
 * DECISION-055 point 4: this is where the invite path's accountStatus
 * 'invited' -> 'active' transition happens — the moment a password is
 * actually set, mirroring exactly when Portal's own reset-password flow
 * would be considered "complete."
 */
export async function consumeInviteTokenAction(input: {
  rawToken: string;
  password: string;
}): Promise<ActionResult> {
  if (input.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const hdrs = await headers();
  const ip = getRequestIp(hdrs);
  const tokenHash = sha256Hex(input.rawToken);

  const limited = await checkRateLimit(
    `invite_consume:${tokenHash}`,
    { max: 10, windowSeconds: 3600 },
    { userId: null, actor: tokenHash.slice(0, 8), reason: "invite_token_consume" },
  );
  if (!limited.allowed) {
    const mins = Math.ceil(limited.retryAfterSeconds / 60);
    return {
      ok: false,
      error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }

  // Atomic claim: DELETE WHERE token matches AND has not expired, RETURNING
  // the claimed row. Zero rows -> invalid, already consumed, or expired
  // (same friendly error either way — no leakage).
  const claimed = await db
    .delete(inviteTokens)
    .where(
      and(eq(inviteTokens.token, tokenHash), gt(inviteTokens.expiresAt, new Date())),
    )
    .returning();

  if (claimed.length === 0) {
    return { ok: false, error: "Invalid or expired invite link." };
  }

  const tokenRow = claimed[0];

  const userRow = await db.query.users.findFirst({
    where: eq(users.id, tokenRow.userId),
    columns: { id: true, email: true },
  });
  if (!userRow) {
    return { ok: false, error: "Account not found." };
  }

  const hashed = await hash(input.password, 10);

  await db
    .update(users)
    .set({
      password: hashed,
      accountStatus: "active",
      failedLoginAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(users.id, userRow.id));

  await recordAudit({
    action: AUDIT_ACTIONS.ADMIN_INVITE_CONSUMED,
    actor: { userId: userRow.id, email: userRow.email },
    resourceType: "user",
    resourceId: userRow.id,
    metadata: { via: "invite_token" },
  });

  return { ok: true };
}
