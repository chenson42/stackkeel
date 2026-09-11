import { describe, it, expect } from "vitest";
import {
  FIXED,
  LEGAL_PAIRS,
  RAMP_STEPS,
  STARTER_RAMP,
  STARTER_SEED,
  type RampStep,
  type RampTokens,
  type Scheme,
} from "./contract";
import { contrastRatio } from "./contrast";
import { generateBrand, oklchOf, oklchToHexClamped } from "./generate";
import { buildBrandCss } from "./brand-tokens";

/**
 * The deterministic seed grid: every combination of 24 hues x 4 lightness
 * bands x 4 chroma bands = 384 seeds, materialized as sRGB hexes through
 * the same OKLCH->hex clamp the generator itself uses. Deliberately
 * includes near-grey (C=0.01), highly saturated (C=0.25), near-white
 * (L=0.92) and near-black (L=0.25) seeds.
 */
function seedGrid(): string[] {
  const seeds: string[] = [];
  for (let h = 0; h < 360; h += 15) {
    for (const L of [0.25, 0.5, 0.7, 0.92]) {
      for (const C of [0.01, 0.08, 0.16, 0.25]) {
        seeds.push(oklchToHexClamped(L, C, h));
      }
    }
  }
  return Array.from(new Set(seeds));
}

function resolve(ref: string, ramp: RampTokens, scheme: Scheme): string {
  if (ref.startsWith("ramp:")) {
    return ramp[Number(ref.slice(5)) as RampStep];
  }
  const key = ref.slice("fixed:".length) as keyof (typeof FIXED)["light"];
  return FIXED[scheme][key];
}

describe("generateBrand — property sweep", () => {
  const seeds = seedGrid();

  it(`every LEGAL_PAIRS floor holds for every grid seed, both schemes (${seeds.length} seeds)`, () => {
    const failures: string[] = [];
    for (const seed of seeds) {
      const brand = generateBrand(seed);
      for (const scheme of ["light", "dark"] as const) {
        const ramp = brand[scheme];
        for (const pair of LEGAL_PAIRS) {
          const fg = resolve(pair.fg, ramp, scheme);
          const bg = resolve(pair.bg, ramp, scheme);
          const ratio = contrastRatio(fg, bg);
          if (ratio < pair.min) {
            failures.push(
              `${seed} ${scheme} ${pair.fg}/${pair.bg}: ${ratio.toFixed(2)} < ${pair.min}`,
            );
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("is deterministic", () => {
    const a = generateBrand("#3b82f6");
    const b = generateBrand("#3b82f6");
    expect(a).toEqual(b);
  });

  it("every emitted value is a well-formed 6-digit hex", () => {
    const brand = generateBrand("#8b5cf6");
    for (const scheme of ["light", "dark"] as const) {
      for (const step of RAMP_STEPS) {
        expect(brand[scheme][step]).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("preserves the seed's hue at the 500 step (identity)", () => {
    for (const seed of ["#e11d48", "#16a34a", "#f59e0b"]) {
      const brand = generateBrand(seed);
      const seedHue = oklchOf(seed).H;
      const outHue = oklchOf(brand.light[500]).H;
      const delta = Math.abs(((outHue - seedHue + 540) % 360) - 180);
      expect(delta).toBeLessThan(2);
    }
  });

  it("a near-grey seed stays near-grey and discloses it", () => {
    const brand = generateBrand("#808080");
    expect(oklchOf(brand.light[500]).C).toBeLessThan(0.03);
    expect(brand.adjustments.some((a) => a.step === "seed")).toBe(true);
  });

  it("a red seed gets the destructive-proximity disclosure", () => {
    const brand = generateBrand("#dc2626");
    expect(
      brand.adjustments.some((a) => a.message.includes("destructive")),
    ).toBe(true);
  });

  it("rejects an unparseable seed", () => {
    expect(() => generateBrand("blue")).toThrow(/Unparseable/);
  });
});

describe("the Starter ramp itself", () => {
  it("satisfies every LEGAL_PAIRS floor in both schemes (the static default is held to the same bar)", () => {
    for (const scheme of ["light", "dark"] as const) {
      for (const pair of LEGAL_PAIRS) {
        const fg = resolve(pair.fg, STARTER_RAMP[scheme], scheme);
        const bg = resolve(pair.bg, STARTER_RAMP[scheme], scheme);
        expect(
          contrastRatio(fg, bg),
          `starter ${scheme} ${pair.fg}/${pair.bg}`,
        ).toBeGreaterThanOrEqual(pair.min);
      }
    }
  });

  it("regenerating from the Starter seed lands in the same lightness neighborhood", () => {
    const brand = generateBrand(STARTER_SEED);
    for (const step of RAMP_STEPS) {
      const gen = oklchOf(brand.light[step]).L;
      const starter = oklchOf(STARTER_RAMP.light[step]).L;
      expect(Math.abs(gen - starter)).toBeLessThan(0.12);
    }
  });
});

describe("buildBrandCss", () => {
  const brand = generateBrand("#0f766e");

  it("emits both scheme blocks under the doubled-specificity selectors", () => {
    const css = buildBrandCss({ light: brand.light, dark: brand.dark, lightOnly: false });
    expect(css).toContain(":root:root {");
    expect(css).toContain(":root:root.dark {");
    for (const step of RAMP_STEPS) {
      expect(css).toContain(`--brand-${step}: ${brand.light[step]};`);
      expect(css).toContain(`--brand-${step}: ${brand.dark[step]};`);
    }
  });

  it("lightOnly re-declares the light ramp under the dark selector", () => {
    const css = buildBrandCss({ light: brand.light, dark: brand.dark, lightOnly: true });
    const darkBlock = css.slice(css.indexOf(":root:root.dark"));
    expect(darkBlock).toContain(`--brand-900: ${brand.light[900]};`);
    expect(darkBlock).not.toContain(brand.dark[900]);
  });
});
