// CLI face of the ramp generator, for personalization and manual preview:
//
//   pnpm brand:generate -- "#1a5aa8"
//
// Prints both scheme token sets as CSS custom-property blocks (paste-ready
// for packages/ui/src/theme.css's :root / .dark ramp sections) plus the
// generator's adjustments log. Read-only: it never writes the database or
// any file — the personalize skill decides where the output lands.

import { generateBrand, RAMP_STEPS, STARTER_SEED } from "../src/index";

const seed = (process.argv[2] ?? STARTER_SEED).trim().toLowerCase();

let brand;
try {
  brand = generateBrand(seed);
} catch (err) {
  console.error(`brand:generate: ${(err as Error).message}`);
  process.exit(1);
}

console.log(`/* Generated from seed ${seed} (brand token version ${brand.version}) */`);
for (const scheme of ["light", "dark"] as const) {
  console.log(`\n/* ${scheme} — paste into ${scheme === "light" ? ":root" : ".dark"} */`);
  for (const step of RAMP_STEPS) {
    console.log(`  --brand-${step}: ${brand[scheme][step]};`);
  }
}

if (brand.adjustments.length > 0) {
  console.log("\nAdjustments:");
  for (const a of brand.adjustments) {
    console.log(`  - [${a.scheme}/${a.step}] ${a.message}`);
  }
} else {
  console.log("\nNo adjustments — the seed's natural ramp already clears every contrast floor.");
}
