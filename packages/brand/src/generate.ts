/**
 * The colour ramp generator.
 *
 * A pure function: one sRGB seed hex -> two independently-derived ramps
 * (light, dark) + an adjustments[] log, versioned. Proven correct by a
 * property test sweeping every LEGAL_PAIRS entry across a deterministic
 * OKLCH grid of seeds, in both schemes (generate.test.ts).
 *
 * ZERO RUNTIME IMPORTS beyond ./contract and ./contrast. No db, no next/*,
 * no react, and no colour-science dependency — Björn Ottosson's reference
 * sRGB<->OKLab transform (https://bottosson.github.io/posts/oklab/) is
 * transcribed inline below, ~40 lines, and is the only new math here;
 * contrast.ts already owns WCAG luminance/ratio and is reused.
 *
 * Derivation, per scheme:
 *   1. Parse the seed; convert to OKLCH (L, C, H). Hue NEVER moves —
 *      identity is the operator's choice; only lightness and chroma bend.
 *   2. Each ramp step starts at the Starter ramp's own OKLCH lightness and
 *      a chroma scaled from the seed's by the Starter curve's own per-step
 *      chroma ratio (so tints stay tints for any seed), gamut-clamped by
 *      binary-searching chroma only.
 *   3. Each step with a LEGAL_PAIRS floor is then pushed DIRECTIONALLY in
 *      lightness (darker in the light scheme, lighter in the dark scheme)
 *      until every floor that references it clears — logged as an
 *      adjustment when the push exceeds a visible threshold, never silent.
 *   4. The destructive-hue proximity check records an adjustment message
 *      when the seed sits within MIN_BRAND_DANGER_HUE_DISTANCE_DEG of the
 *      semantic red — never a forced hue shift.
 *   5. A near-grey seed (chroma < 0.02) keeps its greyness (a deliberately
 *      neutral brand is legitimate) and logs an adjustment note.
 *
 * The dark ramp is derived independently from the dark Starter curve — not
 * a CSS inversion of the light ramp — so floors hold in both schemes by
 * construction.
 */

import {
  BRAND_TOKEN_VERSION,
  DESTRUCTIVE_LIGHT,
  FIXED,
  LEGAL_PAIRS,
  MIN_BRAND_DANGER_HUE_DISTANCE_DEG,
  RAMP_STEPS,
  STARTER_RAMP,
  type RampStep,
  type RampTokens,
  type Scheme,
} from "./contract";
import { contrastRatio, parseColor, type Rgb } from "./contrast";

/* ---------------------------------------------------------------------------
 * Public types
 * ------------------------------------------------------------------------ */

export type BrandAdjustment = {
  readonly step: RampStep | "seed";
  readonly scheme: Scheme | "both";
  /** Written to be quoted directly in the branding editor. */
  readonly message: string;
};

export type GeneratedBrand = {
  readonly version: number;
  readonly light: RampTokens;
  readonly dark: RampTokens;
  readonly adjustments: readonly BrandAdjustment[];
};

/* ---------------------------------------------------------------------------
 * sRGB <-> OKLab/OKLCH — Björn Ottosson's reference transform, transcribed.
 * ------------------------------------------------------------------------ */

type Oklab = { L: number; a: number; b: number };
export type Oklch = { L: number; C: number; H: number };

function srgbChannelToLinear(c: number): number {
  return c >= 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
}

function linearChannelToSrgb(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  return v >= 0.0031308 ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : 12.92 * v;
}

function linearSrgbToOklab(r: number, g: number, b: number): Oklab {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklabToLinearSrgb(lab: Oklab): { r: number; g: number; b: number } {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function rgbToHex(rgb: Rgb): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(rgb.r)}${c(rgb.g)}${c(rgb.b)}`;
}

/** CSS hex -> OKLCH. */
export function oklchOf(css: string): Oklch {
  const { r, g, b } = parseColor(css);
  const lab = linearSrgbToOklab(
    srgbChannelToLinear(r / 255),
    srgbChannelToLinear(g / 255),
    srgbChannelToLinear(b / 255),
  );
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let H = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L: lab.L, C, H };
}

/**
 * OKLCH -> in-gamut sRGB hex, reducing CHROMA only (never lightness or hue)
 * by binary search until every channel lands in [0,1].
 */
export function oklchToHexClamped(L: number, C: number, H: number): string {
  const rad = (H * Math.PI) / 180;
  const toRgb = (c: number): { r: number; g: number; b: number } =>
    oklabToLinearSrgb({ L, a: c * Math.cos(rad), b: c * Math.sin(rad) });
  const inGamut = (lin: { r: number; g: number; b: number }) =>
    lin.r >= -1e-6 && lin.r <= 1 + 1e-6 &&
    lin.g >= -1e-6 && lin.g <= 1 + 1e-6 &&
    lin.b >= -1e-6 && lin.b <= 1 + 1e-6;

  let c = C;
  if (!inGamut(toRgb(c))) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(toRgb(mid))) lo = mid;
      else hi = mid;
    }
    c = lo;
  }
  const lin = toRgb(c);
  return rgbToHex({
    r: linearChannelToSrgb(lin.r) * 255,
    g: linearChannelToSrgb(lin.g) * 255,
    b: linearChannelToSrgb(lin.b) * 255,
  });
}

/* ---------------------------------------------------------------------------
 * Derivation
 * ------------------------------------------------------------------------ */

const NEAR_GREY_CHROMA = 0.02;
/** A lightness push larger than this is disclosed as an adjustment. */
const VISIBLE_LIGHTNESS_DELTA = 0.06;
const SEARCH_STEP = 0.01;

/** Floors that constrain a given ramp step in a scheme, from LEGAL_PAIRS. */
function floorsFor(step: RampStep, scheme: Scheme) {
  const fixed = FIXED[scheme];
  const resolveFixed = (key: string): string => {
    const k = key.slice("fixed:".length) as keyof typeof fixed;
    return fixed[k];
  };
  return LEGAL_PAIRS.filter(
    (p) => p.fg === `ramp:${step}` || p.bg === `ramp:${step}`,
  ).map((p) => ({
    min: p.min,
    other: resolveFixed(p.fg.startsWith("fixed:") ? p.fg : p.bg),
  }));
}

function passesFloors(hex: string, step: RampStep, scheme: Scheme): boolean {
  return floorsFor(step, scheme).every(
    (f) => contrastRatio(hex, f.other) >= f.min,
  );
}

/**
 * Generate both scheme ramps from one seed. Deterministic; pure.
 * Throws only on an unparseable seed — every parseable seed produces a
 * complete, floor-satisfying ramp (the property test's central claim).
 */
export function generateBrand(seedHex: string): GeneratedBrand {
  const seed = oklchOf(seedHex);
  const adjustments: BrandAdjustment[] = [];

  if (seed.C < NEAR_GREY_CHROMA) {
    adjustments.push({
      step: "seed",
      scheme: "both",
      message:
        "The seed is close to grey, so the whole ramp stays neutral. That is a legitimate brand choice — pick a more saturated seed if you expected colour.",
    });
  }

  const destructiveHue = oklchOf(DESTRUCTIVE_LIGHT).H;
  const hueDelta = Math.abs(
    ((seed.H - destructiveHue + 540) % 360) - 180,
  );
  if (seed.C >= NEAR_GREY_CHROMA && hueDelta < MIN_BRAND_DANGER_HUE_DISTANCE_DEG) {
    adjustments.push({
      step: "seed",
      scheme: "both",
      message:
        "The seed's hue sits close to the destructive-action red. Destructive buttons may read as brand-coloured; consider a seed further from red.",
    });
  }

  const build = (scheme: Scheme): RampTokens => {
    const starterSeat = oklchOf(STARTER_RAMP[scheme][500]);
    const ramp = {} as Record<RampStep, string>;

    for (const step of RAMP_STEPS) {
      const starter = oklchOf(STARTER_RAMP[scheme][step]);
      // The seed's chroma, scaled by the Starter curve's own per-step ratio
      // so tints stay tints and fills stay saturated, for any seed.
      const chromaRatio = starterSeat.C > 0 ? starter.C / starterSeat.C : 1;
      const targetC = seed.C * chromaRatio;
      let L = starter.L;
      let hex = oklchToHexClamped(L, targetC, seed.H);

      if (!passesFloors(hex, step, scheme)) {
        // Directional lightness search. Direction depends on the step's
        // ROLE, not just the scheme: fill/ring steps (500/700/900) move
        // AWAY from the scheme's background (darker on light, lighter on
        // dark) so text and ring contrast grows; tint steps (50/100) carry
        // the scheme's ordinary foreground text, so they move TOWARD the
        // background extreme (lighter on light, darker on dark).
        const isTint = step < 500;
        const dir = (scheme === "light" ? -1 : 1) * (isTint ? -1 : 1);
        let moved = 0;
        while (L > 0.02 && L < 0.98) {
          L += dir * SEARCH_STEP;
          moved += SEARCH_STEP;
          hex = oklchToHexClamped(L, targetC, seed.H);
          if (passesFloors(hex, step, scheme)) break;
        }
        if (moved > VISIBLE_LIGHTNESS_DELTA) {
          adjustments.push({
            step,
            scheme,
            message: `Step ${step} (${scheme}) was ${
              dir < 0 ? "darkened" : "lightened"
            } from the seed's natural position to keep text and focus contrast accessible.`,
          });
        }
      }
      ramp[step] = hex;
    }
    return ramp;
  };

  return {
    version: BRAND_TOKEN_VERSION,
    light: build("light"),
    dark: build("dark"),
    adjustments,
  };
}
