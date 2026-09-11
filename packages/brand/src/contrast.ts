/**
 * WCAG 2.x relative luminance and contrast ratio, plus a small CSS colour
 * parser (hex only — the kit's tokens are all hex). Pure; zero imports.
 */

export type Rgb = { r: number; g: number; b: number };

/** #rgb or #rrggbb -> 0-255 channels. Throws on anything else. */
export function parseColor(css: string): Rgb {
  const v = css.trim().toLowerCase();
  const long = v.match(/^#([0-9a-f]{6})$/);
  if (long) {
    const n = parseInt(long[1], 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  const short = v.match(/^#([0-9a-f]{3})$/);
  if (short) {
    const [r, g, b] = short[1].split("");
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    };
  }
  throw new Error(`Unparseable colour: '${css}' (expected #rgb or #rrggbb)`);
}

function channelLuminance(c255: number): number {
  const c = c255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) .. 1 (white). */
export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

/** WCAG contrast ratio between two CSS colours, 1..21. Order-insensitive. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseColor(a));
  const lb = relativeLuminance(parseColor(b));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
