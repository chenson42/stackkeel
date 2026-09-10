// packages/auth/src/verify-recovery-code.ts
//
// Recovery-code lookup + single-use consumption, extracted for each app's
// atomic authorize() path.
//
// Generic over TSchema, matching computeSharedJwtClaims'/createAuth's own
// shape — and deliberately uses `.select().from().where()` rather than
// drizzle's `db.query.*` relational builder. jwt.ts's own header documents
// why: `db.query.*`'s return type is keyed off
// ExtractTablesWithRelations<TSchema>, which cannot be resolved while
// TSchema is still an unresolved generic parameter inside this function
// body. `.select().from()` only needs the table definition.
import { and, eq, isNull } from "drizzle-orm";
import type { Db, IdentitySchema } from "@repo/db";
import { userTotpRecoveryCodes } from "@repo/db";
import { hashRecoveryCode, normalizeRecoveryCode } from "./two-factor";

export type VerifyRecoveryCodeResult =
  | { ok: true; codeId: string }
  | { ok: false; reason: "malformed" | "not_found" };

/**
 * Looks up `rawCode` as an unused recovery code for `userId` and marks it
 * used (single-use consumption) on a match. Does NOT write any audit event
 * — the caller (each app's own atomic authorize() path) has the
 * request-scoped actor identity (email, ip, user-agent) this function
 * doesn't. The audit call belongs at the call site, not inside this shared
 * helper.
 */
export async function verifyRecoveryCode<
  TSchema extends IdentitySchema = IdentitySchema,
>(
  db: Db<TSchema>,
  userId: string,
  rawCode: string,
): Promise<VerifyRecoveryCodeResult> {
  const normalized = normalizeRecoveryCode(rawCode.trim());
  if (!normalized) return { ok: false, reason: "malformed" };

  const hash = hashRecoveryCode(normalized);
  const [match] = await db
    .select({ id: userTotpRecoveryCodes.id })
    .from(userTotpRecoveryCodes)
    .where(
      and(
        eq(userTotpRecoveryCodes.userId, userId),
        eq(userTotpRecoveryCodes.codeHash, hash),
        isNull(userTotpRecoveryCodes.usedAt),
      ),
    )
    .limit(1);
  if (!match) return { ok: false, reason: "not_found" };

  await db
    .update(userTotpRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(eq(userTotpRecoveryCodes.id, match.id));

  return { ok: true, codeId: match.id };
}
