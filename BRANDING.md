# Brand system

Rules for color, logo treatment, and type across every app in this workspace. Follow
these instead of inventing colors, logo treatments, or type choices. Loaded every session
alongside `AGENTS.md`.

**Everything visual here is a placeholder until personalization.** The kit ships with a
neutral identity — "Starter Blue," seed `#2563eb` — that exists so the apps render
complete and correct out of the box. The personalize skill replaces it: you supply one
seed color, `pnpm brand:generate` derives the full token set, and the find-replace pass
swaps the placeholder logo assets for yours.

## The model: one seed color → a generated token ramp

The brand engine lives in `packages/brand` and works from a **single seed hex**:

1. **Contract** (`packages/brand` → `contract.ts`) — pure data, zero runtime imports.
   Declares the token names, the legal foreground/background pairs with WCAG contrast
   floors, the platform default palette, and the curated type pairings. The token policy
   is a **closed three-way partition**:

   | Class | Meaning |
   |---|---|
   | `brandable` | The brand may re-declare freely (accent ramps, chrome tints) |
   | `bounded` | Re-declarable only within a named constraint (e.g. must clear a contrast floor against a fixed partner) |
   | `platform` | Never re-declarable — semantic/status colors and the content axis |

   The `TokenName` type is *derived from* this partition, so "closed" is a type-system
   property, not a prose claim.

2. **Generator** (`generate.ts`) — a pure function: seed hex → two independently derived
   token sets (light and dark — dark is *not* a CSS inversion) + an `adjustments[]` log +
   a version stamp. It searches lightness along the seed's own hue until every legal pair
   clears its contrast floor, clamps to gamut, floors chroma near grey, and only as a
   last resort nudges hue (bounded, always logged, never silent). Property tests sweep
   every legal pair across an OKLCH grid in both schemes — a generator change that breaks
   a contrast guarantee fails the suite, not a user's eyes.

3. **Emitter** (`BrandTokens` component) — the **only** place brand tokens reach the DOM
   at runtime. It renders both schemes in one `:root:root`-specificity `<style>` element
   (specificity beats `globals.css` regardless of source order; a `.dark`-class selector
   keeps theme switching FOUC-free). Plain string child, never `dangerouslySetInnerHTML`.
   The `check:brand-scope` tripwire fails the build if a `<style>` tag or
   `dangerouslySetInnerHTML` appears anywhere else.

`BRAND_TOKEN_VERSION` is pinned: a generator improvement never silently re-skins an
existing deployment — bumping the version is a deliberate, reviewed act.

## Logo assets

| File | Use |
|---|---|
| `brand/logo.svg` | Full badge, no app name. Marketing, email, anywhere the app isn't the subject |
| `brand/logo-<app>.svg` | Badge plus app name. App header, sign-in screen, PDF headers |
| `brand/icon.svg` | Square icon. Favicon, app icon, avatar, collapsed sidebar — **the only icon file**, shared by every app |
| `brand/logo-app-template.svg` | Source for a new app's lockup. Copy, change the name in the `<text>` element only — never the badge fill |

Store them under each app's `public/brand/` and reference from there. Don't paste SVG
markup inline in components unless the color must change at runtime (the one exception is
the shared inline-icon component in `packages/ui`, which forces the glyph fill).

### Rules

- The wordmark is outlined vector. Never re-type it in a font, never letterspace or
  rescale it independently of the badge.
- Keep clear space of at least 20% of badge height on all sides.
- Minimum sizes: 120px wide for a lockup, 24px for the square icon.
- Never put the badge on a background other than white, `--surface`, or the darkest ink.
  No photos behind it.
- No drop shadows, gradients, outlines, or rotation.
- **The badge fill is one color, in every app, with no exception.** A badge tinted per
  app reads as N sub-brands wearing a shared silhouette. One mark, one color; apps are
  told apart by the name next to the badge and by their identity accent — never by
  recoloring the mark.

## Color

### Identity accents — per app, never on the logo

Per-app color exists only as an **in-app UI accent** — the active nav indicator, focus
ring, chart series, the identifying dot next to the app's name in the switcher — exposed
as `--identity-500` in each app's stylesheet. It never touches the logo mark and never
carries meaning.

When adding an app, pick a hue with **real angular separation** from every existing
accent — check the hue angle, don't eyeball the swatch. (The kit's ancestry includes a
derived accent that landed 4° from an existing one; two of three apps read as the same
brand, defeating the accent's only job.) Keep chroma and lightness at the shared scale
values so the accents read as one family.

### The tonal scale

Every accent is the same tonal scale at a different hue. What each step is for:

- `50` / `100` — page tints, selected rows, subtle callouts
- `200` / `300` — borders on branded elements, chart fills, disabled states
- `500` — identity only: active nav, focus ring, chart series, switcher dot. **Never a
  background for text**, and never the badge fill
- `700` — icons and large text (24px+ / 19px bold) on white
- `900` — body text on brand surfaces, button fills, headings

### Contrast

A `500` step typically fails WCAG AA under white text — fine for an accent dot (exempt),
wrong for everything else. So:

- Primary button: `900` background, white text; hover `700`
- Secondary button: `50` background, `900` text, `300` border
- Links: `900`, underlined
- Focus ring: 2px `500` with a 2px offset

Check any new pairing at 4.5:1 (normal text) / 3:1 (large text, UI boundaries) before
shipping. The generated ramp guarantees the pairs declared in the contract; hand-picked
pairings outside it are on you.

### Status colors are platform tokens

Success / warning / destructive / info are `platform`-class tokens — shared by every app,
never tinted toward an app's hue, and never reused as an identity accent. In an app where
a status color sits next to data (charts, indicators), never use an identity accent that
is ambiguous against it — ambiguity there is a correctness problem, not a style problem.

### CSS

Tokens are declared once (the emitter at runtime; `theme.css` in `packages/ui` for the
static base) and referenced everywhere. **Raw hex values never appear in components** —
if you need a color, there is a token for it or you are doing something the token policy
forbids.

## Typography

Four curated type pairings, chosen and locked in the contract — open font selection is
deliberately rejected (self-hosted via `next/font`, no runtime font requests):

| Pairing | Heading | Body |
|---|---|---|
| `classic` | Lora | Source Sans 3 |
| `modern` | Libre Franklin | Public Sans |
| `warm` | Bitter | Karla |
| `contemporary` | Montserrat | Open Sans |

The personalize skill picks one; every app in the workspace uses the same pairing — a
shared switcher showing different heading faces reads as different products that happen
to share a badge.

- Body 16px / 1.55. Nothing a user must read below 14px.
- Line length under 80 characters.
- Sentence case for headings, labels, and buttons. An all-caps app name in a logo lockup
  is part of the logo, not a pattern to repeat in the UI.
- Buttons say what happens: "Save changes", not "Submit". The same action keeps the same
  name through the whole flow.

## Applying the identity

The app accent carries identity, not meaning. Where it belongs: the active nav item, the
focus ring, the top border of the app shell, chart series in a neutral report, the dot
next to the app's name in the switcher. **One accent per screen** — if everything is
branded, nothing reads as the primary action. Never the logo mark, never a status
surface.

### Sidebar identity rule

Sidebar chrome (`--sidebar-*` tokens) is byte-identical across every app's stylesheet —
defined once in `packages/ui`'s `theme.css` with `--identity-500` as the only per-app
value. An app that overrides sidebar tokens locally is how two apps end up with visibly
different menus; the tripwire-checkable rule is that no app stylesheet redeclares a
`--sidebar-*` token.

## Raster assets

Generate favicon/app icons from the one icon SVG:

```
npx sharp-cli -i public/brand/icon.svg -o favicon-32.png resize 32 32
npx sharp-cli -i public/brand/icon.svg -o icon-192.png resize 192 192
npx sharp-cli -i public/brand/icon.svg -o icon-512.png resize 512 512
```

Set the web manifest `theme_color` to the app's `900` and `background_color` to white.
The native shell and mobile app read their icon/splash colors from `packages/tokens`, so
regenerate those after `pnpm brand:generate`.

## Adding an app to the family

1. Pick an identity hue with real angular separation from every existing accent; keep the
   shared chroma/lightness scale.
2. Check the `900` step clears 4.5:1 against white.
3. Copy `logo-app-template.svg` for the new lockup — change only the `<text>` element.
4. Define `--identity-500` in the new app's stylesheet; do **not** add a tinted icon
   variant or any `--sidebar-*` overrides.
