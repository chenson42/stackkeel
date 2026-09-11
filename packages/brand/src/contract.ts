/**
 * The brand token contract.
 *
 * This file is data, not behaviour. It declares the closed vocabulary the
 * rest of the brand system reads: which ramp steps exist, which tokens a
 * runtime brand may re-declare, which foreground/background pairs are legal
 * and what contrast floor each carries, the curated type pairings, and the
 * static Starter palette the generator's output is measured against.
 *
 * ZERO RUNTIME IMPORTS. No db, no next/*, no react, and no import of its
 * own siblings — `contrast.ts` imports this file (type-only allowed), never
 * the other way round. That constraint is what lets the contract be read
 * from an Edge route, from a vitest run with no database, and from the
 * plain-Node `scripts/brand-generate.mjs` CLI. Cheap to hold now,
 * impossible to recover once one import lands.
 */

/**
 * Pinned so a generator improvement cannot silently re-skin a deployment.
 * The `branding` row stores the version its tokens were saved under; a bump
 * is a deliberate migration, never a dependency upgrade.
 */
export const BRAND_TOKEN_VERSION = 1;

/* ---------------------------------------------------------------------------
 * The ramp — the kit's brandable surface.
 *
 * packages/ui/src/theme.css derives every interactive token (--primary,
 * --accent, --ring, ...) from the `--brand-*` ramp via var() indirection.
 * The runtime brand therefore re-declares ONLY the ramp steps; everything
 * downstream follows without this package ever touching a platform token.
 * That indirection is the kit's version of the ancestor's closed
 * brandable/platform partition: the brandable set is exactly RAMP_STEPS,
 * and the platform set is everything else in theme.css — the content axis
 * (background/foreground/card/popover/muted/secondary), the semantic
 * colours (destructive/success/warning/info), borders, inputs, and radius,
 * none of which this package may ever emit. check-brand-scope enforces the
 * emitter's monopoly; this comment is the rule it enforces.
 * ------------------------------------------------------------------------ */

export const RAMP_STEPS = [50, 100, 200, 300, 500, 700, 900] as const;
export type RampStep = (typeof RAMP_STEPS)[number];

/** The CSS custom property for a ramp step. */
export function rampToken(step: RampStep): string {
  return `--brand-${step}`;
}

export type Scheme = "light" | "dark";

/** One scheme's ramp: step -> hex. */
export type RampTokens = Record<RampStep, string>;

/**
 * Fixed counterpart colours the pairs below are measured against. These are
 * PLATFORM values transcribed from packages/ui/src/theme.css — the
 * generator never changes them; it moves the ramp until the floors clear.
 * contract.test.ts parses theme.css and asserts this transcription in both
 * directions, so the two files cannot drift silently.
 */
export const FIXED = {
  light: {
    background: "#ffffff",
    foreground: "#1f2733",
    /** --primary-foreground: text drawn on the brand fill (brand-900). */
    onBrand: "#ffffff",
    /** --accent-foreground: text drawn on the accent fill (brand-700). */
    onAccent: "#ffffff",
  },
  dark: {
    background: "#0e141c",
    foreground: "#e3e8ef",
    /** dark --primary-foreground: near-black text on the light brand fill. */
    onBrand: "#0b1220",
    onAccent: "#0b1220",
  },
} as const;

/* ---------------------------------------------------------------------------
 * Legal pairs — the floors the generator must satisfy and the property test
 * sweeps. The runtime array is the source of truth; the test reads `min`
 * FROM THE PAIR rather than restating WCAG numbers, so adding a pair
 * automatically adds its assertion.
 *
 * Pair semantics follow BRANDING.md's step meanings:
 *   900 — button fills (carries onBrand text) and brand-coloured body text
 *   700 — icons / large text / accent fills on the page surface
 *   500 — the identity colour and the focus ring (never text)
 *   50/100 — tinted surfaces that carry ordinary foreground text
 * ------------------------------------------------------------------------ */

export type BrandPair = {
  /** "fixed:<key>" reads from FIXED[scheme]; "ramp:<step>" from the ramp. */
  readonly fg: string;
  readonly bg: string;
  /** The WCAG contrast floor for THIS pair. Required. */
  readonly min: number;
  readonly kind: "text" | "large-text" | "non-text" | "body";
};

export const LEGAL_PAIRS = [
  // Button fill: onBrand text on the 900 fill.
  { fg: "fixed:onBrand", bg: "ramp:900", min: 4.5, kind: "text" },
  // Brand text: 900 used as coloured text on the page surface.
  { fg: "ramp:900", bg: "fixed:background", min: 4.5, kind: "text" },
  // Accent fill: onAccent text on the 700 fill.
  { fg: "fixed:onAccent", bg: "ramp:700", min: 4.5, kind: "text" },
  // Icons / large text: 700 against the page surface.
  { fg: "ramp:700", bg: "fixed:background", min: 3, kind: "large-text" },
  // Focus ring: 500 against the page surface. Structural note: rings are
  // drawn with a 2px surface offset (FOCUS_RING_OFFSET_PX), so ring
  // contrast is only ever measured against the surface, never the control.
  { fg: "ramp:500", bg: "fixed:background", min: 3, kind: "non-text" },
  // Tinted surfaces still carry ordinary body text.
  { fg: "fixed:foreground", bg: "ramp:50", min: 7, kind: "body" },
  { fg: "fixed:foreground", bg: "ramp:100", min: 7, kind: "body" },
] as const satisfies readonly BrandPair[];

/** See LEGAL_PAIRS' focus-ring note. */
export const FOCUS_RING_OFFSET_PX = 2;

/**
 * Semantic-colour separation, as a HUE question, not a contrast ratio (a
 * WCAG ratio between two saturated mid-tones produces nonsense). If the
 * seed's OKLCH hue lands within this many degrees of the destructive red,
 * the generator records an adjustment message — never a forced hue shift,
 * which would change the identity the operator chose.
 */
export const MIN_BRAND_DANGER_HUE_DISTANCE_DEG = 45;

/** theme.css's --destructive (light), for the hue-distance check. */
export const DESTRUCTIVE_LIGHT = "#dc2626";

/* ---------------------------------------------------------------------------
 * The Starter ramp — theme.css's hand-tuned placeholder, transcribed.
 *
 * Two jobs: (1) the generator derives its per-step lightness targets from
 * this curve, so a generated ramp "sits where Starter Blue sits" with the
 * seed's own hue; (2) the property test asserts the transcription against
 * theme.css so neither drifts.
 * ------------------------------------------------------------------------ */

export const STARTER_RAMP = {
  light: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    500: "#3b82f6",
    700: "#1d4ed8",
    900: "#1e3a8a",
  },
  dark: {
    50: "#172137",
    100: "#1c2a49",
    200: "#23365f",
    300: "#2f4a85",
    500: "#60a5fa",
    700: "#93c5fd",
    900: "#dbeafe",
  },
} as const satisfies Record<Scheme, RampTokens>;

/** The seed that theme.css's placeholder ramp was tuned around. */
export const STARTER_SEED = "#3b82f6";

/* ---------------------------------------------------------------------------
 * Emission selectors.
 *
 * `:root:root` is specificity 0,2,0 and beats theme.css's `:root`;
 * `:root:root.dark` is 0,2,1 and beats its `.dark`. Specificity rather than
 * source order, because React does not guarantee where a rendered <style>
 * lands relative to the stylesheet, and source-order dependence is exactly
 * the kind of defect that passes tsc, next build, and a page screenshot.
 * Exported so the emitter and its test share one string.
 * ------------------------------------------------------------------------ */

export const BRAND_SCOPE_SELECTOR = ":root:root";
export const BRAND_SCOPE_SELECTOR_DARK = ":root:root.dark";

/* ---------------------------------------------------------------------------
 * Type pairings — a closed, curated set. Open font selection is rejected:
 * a curated set can be validated against the real UI in both schemes; a
 * font picker cannot. Google Fonts families only. Resolution to next/font
 * imports is deliberately NOT here (next/font imports must be statically
 * analyzable and are Next-coupled) — each app wires the pairing it renders.
 * ------------------------------------------------------------------------ */

export type TypePairing = {
  /** kebab-case, stored verbatim in branding.type_pairing. */
  readonly key: string;
  readonly label: string;
  readonly heading: string;
  readonly body: string;
  /** One sentence, quotable in a review. */
  readonly why: string;
};

export const TYPE_PAIRINGS = [
  {
    key: "classic",
    label: "Classic",
    heading: "Lora",
    body: "Source Sans 3",
    why: "Lora's calm serif curves give headings an established, print-like register, and Source Sans 3's wide apertures and large x-height keep dense table cells legible.",
  },
  {
    key: "modern",
    label: "Modern",
    heading: "Libre Franklin",
    body: "Public Sans",
    why: "Libre Franklin's grotesque sturdiness gives headings confident weight without reading as trendy, and Public Sans was engineered for cross-age accessibility at small sizes.",
  },
  {
    key: "warm",
    label: "Warm",
    heading: "Bitter",
    body: "Karla",
    why: "Bitter's slab serif is grounded and warm, and Karla's rounded humanist letterforms carry that warmth into body copy while holding a large x-height.",
  },
  {
    key: "contemporary",
    label: "Contemporary",
    heading: "Montserrat",
    body: "Open Sans",
    why: "Montserrat's geometric caps give headings a confident, current voice, and Open Sans's near-ubiquitous familiarity keeps body copy calm and easy to scan.",
  },
] as const satisfies readonly TypePairing[];

export type TypePairingKey = (typeof TYPE_PAIRINGS)[number]["key"];

export function isTypePairingKey(value: string): value is TypePairingKey {
  return TYPE_PAIRINGS.some((p) => p.key === value);
}
