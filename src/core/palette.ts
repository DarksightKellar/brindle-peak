/**
 * Palette + colour grading. Pure math, no three, no DOM. Director-owned because the
 * "no black" guarantee is the single load-bearing rule of the art direction.
 *
 * Pipeline order matters: hue and saturation are adjusted first, then the shadow lift is
 * applied LAST so that the luminance floor is guaranteed for every possible input colour,
 * regardless of what the earlier stages did.
 */

import type { GradeSettings, RGB } from './contracts';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const fromHex = (hex: string): RGB => {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
};

export const toHex = (c: RGB): string => {
  const p = (v: number): string =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${p(c.r)}${p(c.g)}${p(c.b)}`.toUpperCase();
};

/** Rec.709 relative luminance, in 0..1. This is the metric the acceptance harness asserts on. */
export const luminance = (c: RGB): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** HSL lightness — the second metric the harness reports. `(max+min)/2`. */
export const lightness = (c: RGB): number => (Math.max(c.r, c.g, c.b) + Math.min(c.r, c.g, c.b)) / 2;

export const saturationOf = (c: RGB): number => {
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  const l = (mx + mn) / 2;
  if (mx === mn) return 0;
  return (mx - mn) / (1 - Math.abs(2 * l - 1) || 1e-6);
};

export const hueOf = (c: RGB): number => {
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  const d = mx - mn;
  if (d < 1e-9) return 0;
  let h: number;
  if (mx === c.r) h = ((c.g - c.b) / d) % 6;
  else if (mx === c.g) h = (c.b - c.r) / d + 2;
  else h = (c.r - c.g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
};

// Re-exported so every existing importer of the palette keeps working; the maths lives in colorHsl.
export { hslToRgb, rgbToHsl } from './colorHsl';
import { hslToRgb, rgbToHsl } from './colorHsl';

export const scaleSaturation = (c: RGB, amount: number): RGB => {
  const y = luminance(c);
  const at = (a: number): RGB => ({
    r: y + (c.r - y) * a,
    g: y + (c.g - y) * a,
    b: y + (c.b - y) * a,
  });
  const inGamut = (v: RGB): boolean =>
    v.r >= -1e-9 && v.r <= 1 + 1e-9 && v.g >= -1e-9 && v.g <= 1 + 1e-9 && v.b >= -1e-9 && v.b <= 1 + 1e-9;

  const full = at(amount);
  if (inGamut(full)) return full;

  let lo = 1;
  let hi = amount;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(at(mid))) lo = mid;
    else hi = mid;
  }
  return at(lo);
};

/** Rotate hue by `degrees`, preserving HSL lightness and saturation. */
export const shiftHue = (c: RGB, degrees: number): RGB => {
  if (degrees === 0) return c;
  const { h, s, l } = rgbToHsl(c);
  if (s < 1e-6) return c;
  return hslToRgb(h + degrees, s, l);
};

/**
 * Split tonality: warm band pushed warmer, cool band pushed cooler. This is what keeps a
 * snow-blue scene from reading as a grey scene.
 */
export const splitTone = (c: RGB, amount: number): RGB => {
  if (amount <= 0) return c;
  const { h, s, l } = rgbToHsl(c);
  if (s < 0.04) return c;
  const warm = h >= 10 && h <= 70 ? 1 - Math.abs(h - 40) / 30 : 0;
  const cool = h >= 180 && h <= 270 ? 1 - Math.abs(h - 225) / 45 : 0;
  const push = (warm * 6 - cool * 6) * amount;
  if (Math.abs(push) < 1e-6) return c;
  return hslToRgb(h + push, s, l);
};

/*
 * `GradeSettings` from contracts is the one grade shape. A second, structurally identical interface
 * used to live here with `shadowFloor: RGB` instead of a tuple — two types for one concept is how
 * the renderer and the tests drifted apart in the first place.
 */

/**
 * Apply the full grade.
 *
 * The lift is applied last and uses the screen-style form `c + floor*lift*(1-c)`:
 *   - at c = 0 it yields exactly `shadowFloor * lift`, so no pixel can ever be black;
 *   - at c = 1 it yields exactly 1, so lit snow stays pure white.
 * The naive form `c*(1-k) + floor*k` would have eaten 6.5 % off every highlight.
 */
export const grade = (c: RGB, g: GradeSettings): RGB => {
  let out = scaleSaturation(c, g.saturation);
  out = shiftHue(out, g.hueShift);
  out = splitTone(out, g.splitTonality);
  out = { r: clamp01(out.r), g: clamp01(out.g), b: clamp01(out.b) };
  const k = clamp01(g.lift);
  return {
    r: clamp01(out.r + g.shadowFloor[0] * k * (1 - out.r)),
    g: clamp01(out.g + g.shadowFloor[1] * k * (1 - out.g)),
    b: clamp01(out.b + g.shadowFloor[2] * k * (1 - out.b)),
  };
};

/** The darkest colour the game is permitted to contain. */
/**
 * THE shipped grade. Single source of truth: `game/render/pixelConfig.ts` imports this rather than
 * keeping its own copy.
 *
 * Why this matters: these values used to exist twice — once here at 0.155/1.06/0.55 with a pale
 * blue lift tint, and once in the renderer at 0.165/2.6/0.40 with the dark shadow floor. Every test
 * in this file was therefore validating a grade that nothing rendered.
 *
 * NOTE ON THE FLOOR. With `shadowFloor` set to SHADOW_FLOOR (#1E2A44), `grade(black)` produces the
 * luminance reported as MIN_LUMINANCE — around 0.026, far darker than the 0.11 the art bible asks
 * for. So the lift is a *shadow tint*, not a no-black guarantee. The no-black rule is enforced
 * empirically by the per-frame gate over real rendered frames (`core/artgate.ts`,
 * `tools/contact-sheet.ts`), which asserts no pixel below L 0.10.
 */
export const GRADE_SETTINGS: GradeSettings = {
  lift: 0.165,
  // PALETTE.SHADOW_FLOOR, spelled literally because PALETTE is declared further down this file.
  shadowFloor: [0.118, 0.165, 0.267],
  saturation: 2.6,
  hueShift: 0,
  splitTonality: 0.4,
};

/**
 * Luminance of `grade(black)` under GRADE_SETTINGS. This is a *tint floor*, not a no-black
 * guarantee — it is about 0.027, well under the 0.11 the benchmark measures. The visual rule is
 * enforced on rendered frames instead (core/artgate.ts). Kept as an exact identity so the maths is
 * asserted even though the number is not the one the art bible talks about.
 */
export const MIN_LUMINANCE = luminance({
  r: GRADE_SETTINGS.shadowFloor[0] * GRADE_SETTINGS.lift,
  g: GRADE_SETTINGS.shadowFloor[1] * GRADE_SETTINGS.lift,
  b: GRADE_SETTINGS.shadowFloor[2] * GRADE_SETTINGS.lift,
});

// ---------------------------------------------------------------------------
// Palette. Values are the ART_BIBLE §3 table, sRGB hex.
// ---------------------------------------------------------------------------

export const PALETTE = {
  SNOW_HI: '#FAFDFF',
  SNOW_LT: '#E4EEF7',
  SNOW_MID: '#C6D9EA',
  SNOW_SH: '#9CB8D2',
  SNOW_DEEP: '#7796B6',
  SNOW_NIGHT: '#5A7BA0',

  ICE_HI: '#CFEDF5',
  ICE_MID: '#9AD4E6',
  ICE_DEEP: '#5FA8C4',
  WATER_DEEP: '#2E6A8C',
  WATER_DK: '#23506E',
  WATER_FOAM: '#EAF6FA',
  /** Spring steam: brighter than the pale sky, so a column reads against it (critic round 47). */
  STEAM: '#FFFFFF',

  ROCK_LT: '#A9AEC0',
  ROCK_MID: '#7C8398',
  ROCK_DK: '#565E75',
  ROCK_WARM: '#8A7B72',
  ROCK_SNOWCAP: '#D9E4EF',

  PINE_HI: '#6E8F72',
  PINE_MID: '#446B52',
  PINE_DK: '#2C4C3E',
  PINE_NIGHT: '#223C33',
  BARK: '#4E3B2C',
  BRUSH: '#7C6A55',

  SUN_HI: '#FFEBC8',
  SUN_MID: '#F7CE86',
  AMBER: '#E8A64F',
  LANTERN: '#FFC46A',
  WOOD_LT: '#A8764E',
  WOOD_MID: '#7E5334',
  WOOD_DK: '#563724',
  BRICK: '#B0603F',

  SKY_HI: '#DCE8F5',
  SKY_MID: '#B9CFE6',
  SKY_LOW: '#8FA8CE',
  DUSK: '#8B93D6',
  NIGHT: '#33406B',
  SHADOW_FLOOR: '#1E2A44',
  AURORA_G: '#7FE3C0',
  AURORA_V: '#B49BE8',
  AURORA_P: '#E6A8C8',

  // Cream, not white: critic rounds 42 and 43 saw a white Pip vanish into the snow by day.
  PIP_BODY: '#F3E2C2',
  PIP_WING: '#C99A6A',
  PIP_BEAK: '#4A4038',
  PIP_SCARF: '#C4574C',
  PIP_GLASS: '#3B3F4A',
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** Palette as linear-ish 0..1 RGB, for vertex colours and material uniforms. */
export const paletteRgb = (key: PaletteKey): RGB => fromHex(PALETTE[key]);
