/**
 * RGB <-> HSL. Kept apart from the palette because this is generic colour maths with no knowledge of
 * the game's palette, and because the same conversions should not get a second implementation anywhere
 * else in the tree.
 */

import type { RGB } from './contracts';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const rgbToHsl = (c: RGB): { h: number; s: number; l: number } => {
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d < 1e-9) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === c.r) h = ((c.g - c.b) / d) % 6;
  else if (mx === c.g) h = (c.b - c.r) / d + 2;
  else h = (c.r - c.g) / d + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s, l };
};

export const hslToRgb = (h: number, s: number, l: number): RGB => {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: clamp01(r + m), g: clamp01(g + m), b: clamp01(b + m) };
};

/**
 * Luma-preserving saturation scale. `amount` < 1 desaturates, > 1 saturates.
 *
 * When saturating would push a channel out of gamut, the scale is reduced to the largest
 * value that stays in gamut. Clamping instead would silently break the luma invariant
 * (a clipped channel changes the weighted sum), so we bisect for the safe maximum.
 */
