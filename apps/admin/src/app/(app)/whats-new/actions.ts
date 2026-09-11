"use server";
import "server-only";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { whatsNewEntries } from "@/lib/db/schema";
import { FEATURES, hasFeature } from "@/lib/permissions";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import type { ActionResult } from "@/types/actions";
import { validateWhatsNewEntry } from "./validate";

// ---------------------------------------------------------------------------
// createWhatsNewEntry
// ---------------------------------------------------------------------------

/**
 * Create a new What's-new entry visible to all members.
 * Gate: requires admin.whats_new feature on every call.
 * publishedAt is set by the DB default (NOW()) and is never passed explicitly.
 */
export async function createWhatsNewEntry(data: {
  emoji: string;
  title: string;
  body: string;
}): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }
  if (!hasFeature(session.user.features, FEATURES.ADMIN_WHATS_NEW)) {
    return { ok: false, error: "Forbidden." };
  }

  const validation = validateWhatsNewEntry(data);
  if (!validation.ok) {
    const firstError = Object.values(validation.errors)[0] ?? "Invalid input.";
    return { ok: false, error: firstError };
  }

  const [row] = await db
    .insert(whatsNewEntries)
    .values({
      emoji: data.emoji.trim() || null,
      title: data.title.trim(),
      body: data.body.trim(),
      createdBy: session.user.id,
      updatedBy: session.user.id,
    })
    .returning({ id: whatsNewEntries.id });

  await recordAudit({
    action: AUDIT_ACTIONS.WHATS_NEW_ENTRY_CREATED,
    resourceType: "whats_new_entry",
    resourceId: row.id,
  });

  revalidatePath("/admin/whats-new");
  revalidatePath("/whats-new");
  revalidatePath("/home");

  return { ok: true, data: { id: row.id } };
}

// ---------------------------------------------------------------------------
// updateWhatsNewEntry
// ---------------------------------------------------------------------------

/**
 * Update an existing What's-new entry.
 * publishedAt is NEVER changed on update — the entry keeps its original
 * publication order (enforced by never including publishedAt in .set()).
 */
export async function updateWhatsNewEntry(
  id: string,
  data: { emoji: string; title: string; body: string },
): Promise<ActionResult<void>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }
  if (!hasFeature(session.user.features, FEATURES.ADMIN_WHATS_NEW)) {
    return { ok: false, error: "Forbidden." };
  }

  const existing = await db.query.whatsNewEntries.findFirst({
    where: eq(whatsNewEntries.id, id),
    columns: { id: true },
  });
  if (!existing) {
    return { ok: false, error: "Entry not found." };
  }

  const validation = validateWhatsNewEntry(data);
  if (!validation.ok) {
    const firstError = Object.values(validation.errors)[0] ?? "Invalid input.";
    return { ok: false, error: firstError };
  }

  // INVARIANT: publishedAt is NOT included in set(). Editing does not change
  // the publication order. This is the ordering invariant for the member list.
  await db
    .update(whatsNewEntries)
    .set({
      emoji: data.emoji.trim() || null,
      title: data.title.trim(),
      body: data.body.trim(),
      updatedBy: session.user.id,
    })
    .where(eq(whatsNewEntries.id, id));

  await recordAudit({
    action: AUDIT_ACTIONS.WHATS_NEW_ENTRY_UPDATED,
    resourceType: "whats_new_entry",
    resourceId: id,
  });

  revalidatePath("/admin/whats-new");
  revalidatePath("/whats-new");
  revalidatePath("/home");

  return { ok: true };
}

// ---------------------------------------------------------------------------
// deleteWhatsNewEntry
// ---------------------------------------------------------------------------

/**
 * Hard-delete a What's-new entry. Idempotent: if the row does not exist,
 * DELETE affects 0 rows and we still return { ok: true }.
 * V1: hard delete with audit event; soft-delete is V2 if needed.
 */
export async function deleteWhatsNewEntry(
  id: string,
): Promise<ActionResult<void>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }
  if (!hasFeature(session.user.features, FEATURES.ADMIN_WHATS_NEW)) {
    return { ok: false, error: "Forbidden." };
  }

  await db.delete(whatsNewEntries).where(eq(whatsNewEntries.id, id));

  await recordAudit({
    action: AUDIT_ACTIONS.WHATS_NEW_ENTRY_DELETED,
    resourceType: "whats_new_entry",
    resourceId: id,
  });

  revalidatePath("/admin/whats-new");
  revalidatePath("/whats-new");
  revalidatePath("/home");

  return { ok: true };
}
