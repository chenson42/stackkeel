/**
 * The ONE place runtime brand CSS enters the page. check-brand-scope
 * (scripts/check-brand-scope.mjs) enforces this monopoly: any other <style
 * tag or dangerouslySetInnerHTML in apps/* or packages/* fails CI.
 *
 * WHY A :root-SCOPED <style> AND NOT A WRAPPER DIV: a wrapper <div> does
 * nothing for anything Radix renders into a portal (DropdownMenu.Portal,
 * Dialog.Portal, the Toaster in the root layout) — a :root-scoped rule
 * reaches them; a scoped class on a div does not.
 *
 * WHY :root:root (see contract.ts BRAND_SCOPE_SELECTOR): specificity
 * (0,2,0 / 0,2,1) beats theme.css's :root and .dark regardless of where
 * React places this <style> tag — source-order dependence is exactly the
 * kind of defect that passes tsc, next build, and a page screenshot.
 *
 * Both schemes ship in ONE <style> element (next-themes selects with the
 * .dark class; a media query could not honor the user's explicit toggle
 * and would reintroduce the flash of wrong theme).
 *
 * The child is a PLAIN STRING, never dangerouslySetInnerHTML — the values
 * interpolated are generator-produced hex strings, but the discipline is
 * kept anyway so the brand-scope tripwire's "no dangerouslySetInnerHTML"
 * rule holds without an exemption list.
 *
 * NULL RENDERS NULL: no branding row, flag off, invalid seed — the caller
 * has nothing to pass and this component renders nothing, leaving the
 * static Starter palette in effect. The component never branches on who
 * the caller is.
 */

import {
  BRAND_SCOPE_SELECTOR,
  BRAND_SCOPE_SELECTOR_DARK,
  RAMP_STEPS,
  rampToken,
  type RampTokens,
} from "./contract";
import { generateBrand } from "./generate";

function declarationBlock(ramp: RampTokens): string {
  return RAMP_STEPS.map((s) => `  ${rampToken(s)}: ${ramp[s]};`).join("\n");
}

/**
 * Pure CSS builder — exported separately so the emitter's output is
 * unit-testable without rendering React.
 */
export function buildBrandCss(input: {
  light: RampTokens;
  dark: RampTokens;
  lightOnly: boolean;
}): string {
  const lightBlock = `${BRAND_SCOPE_SELECTOR} {\n${declarationBlock(input.light)}\n}`;
  // lightOnly: the dark selector re-declares the LIGHT ramp, so a brand
  // that declines a dark scheme stays coherent when the OS/user toggles
  // dark — the platform's dark content axis still applies; only the brand
  // ramp holds still.
  const darkRamp = input.lightOnly ? input.light : input.dark;
  const darkBlock = `${BRAND_SCOPE_SELECTOR_DARK} {\n${declarationBlock(darkRamp)}\n}`;
  return `${lightBlock}\n${darkBlock}`;
}

export interface BrandTokensProps {
  /**
   * The saved branding row, or null. Null renders null — this is how "no
   * brand saved", "flag off", and error paths all stay on the Starter
   * palette: by the caller having nothing to pass.
   */
  brand: { seedHex: string; lightOnly: boolean } | null;
}

export function BrandTokens({ brand }: BrandTokensProps) {
  if (!brand) return null;
  let css: string;
  try {
    const generated = generateBrand(brand.seedHex);
    css = buildBrandCss({
      light: generated.light,
      dark: generated.dark,
      lightOnly: brand.lightOnly,
    });
  } catch {
    // An unparseable stored seed must degrade to the Starter palette, not
    // take down every page's layout.
    return null;
  }
  return <style>{css}</style>;
}
