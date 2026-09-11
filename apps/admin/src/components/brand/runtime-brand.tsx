import { eq } from "drizzle-orm";
import { BrandTokens } from "@repo/brand";
import { db } from "@/lib/db";
import { branding } from "@/lib/db/schema";
import { isFlagEnabled } from "@/lib/flags";

/**
 * The runtime-brand mount: reads the ui.brand_theming flag and the single
 * `branding` row, and hands the result to @repo/brand's <BrandTokens>
 * emitter — the ONE component allowed to emit a <style> tag
 * (check-brand-scope tripwire).
 *
 * Renders in the ROOT layout so the tokens reach every page AND every
 * Radix portal (a portal escapes any route-group wrapper; only a
 * :root-scoped rule reaches it). Every read is guarded — a layout-level
 * component is not worth a 500; on any failure the static Starter palette
 * simply stays in effect.
 */
export async function RuntimeBrand() {
  // Data reads inside the try; JSX construction OUTSIDE it (a rendered
  // component's errors don't surface through this try/catch anyway —
  // react-hooks/error-boundaries — and <BrandTokens> already degrades to
  // null on a bad stored seed internally).
  let row: { seedHex: string; lightOnly: boolean } | undefined;
  try {
    if (!(await isFlagEnabled("ui.brand_theming"))) return null;
    [row] = await db
      .select({ seedHex: branding.seedHex, lightOnly: branding.lightOnly })
      .from(branding)
      .where(eq(branding.id, "default"))
      .limit(1);
  } catch (err) {
    console.error("[runtime-brand] falling back to the static palette:", err);
    return null;
  }
  if (!row) return null;
  return <BrandTokens brand={{ seedHex: row.seedHex, lightOnly: row.lightOnly }} />;
}
