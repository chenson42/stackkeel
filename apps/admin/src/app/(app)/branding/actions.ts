"use server";
import "server-only";

import { eq } from "drizzle-orm";
import { BRAND_TOKEN_VERSION, isTypePairingKey } from "@repo/brand";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { FEATURES, hasFeature } from "@repo/permissions";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import type { ActionResult } from "@/types/actions";

const SEED_HEX_RE = /^#[0-9a-f]{6}$/;

/**
 * Save the single brand row. The row stores INPUTS (seed, pairing, scheme
 * policy) — tokens are derived at render time by @repo/brand's generator.
 * Every save appends to branding_history and writes an audit event: the
 * brand drives every page's rendered identity, so a change is a
 * security-relevant (defacement-class) mutation.
 */
export async function saveBrandingAction(input: {
  seedHex: string;
  typePairing: string;
  lightOnly: boolean;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  if (!hasFeature(session.user.features, FEATURES.ADMIN_BRANDING)) {
    return { ok: false, error: "Forbidden." };
  }

  const seedHex = input.seedHex.trim().toLowerCase();
  if (!SEED_HEX_RE.test(seedHex)) {
    return { ok: false, error: "Seed color must be a 6-digit hex like #1a5aa8." };
  }
  if (!isTypePairingKey(input.typePairing)) {
    return { ok: false, error: "Unknown type pairing." };
  }

  const values = {
    seedHex,
    typePairing: input.typePairing,
    lightOnly: input.lightOnly,
    brandTokenVersion: BRAND_TOKEN_VERSION,
    updatedBy: session.user.id,
  };

  await db
    .insert(schema.branding)
    .values({ id: "default", ...values })
    .onConflictDoUpdate({ target: schema.branding.id, set: values });

  await db.insert(schema.brandingHistory).values({
    seedHex,
    typePairing: input.typePairing,
    lightOnly: input.lightOnly,
    brandTokenVersion: BRAND_TOKEN_VERSION,
    changedBy: session.user.id,
  });

  await recordAudit({
    action: AUDIT_ACTIONS.BRANDING_UPDATED,
    resourceType: "branding",
    resourceId: "default",
    metadata: { seedHex, typePairing: input.typePairing, lightOnly: input.lightOnly },
  });

  return { ok: true };
}

/** Remove the brand row entirely — back to the static Starter palette. */
export async function clearBrandingAction(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  if (!hasFeature(session.user.features, FEATURES.ADMIN_BRANDING)) {
    return { ok: false, error: "Forbidden." };
  }

  await db.delete(schema.branding).where(eq(schema.branding.id, "default"));

  await recordAudit({
    action: AUDIT_ACTIONS.BRANDING_UPDATED,
    resourceType: "branding",
    resourceId: "default",
    metadata: { cleared: true },
  });

  return { ok: true };
}
