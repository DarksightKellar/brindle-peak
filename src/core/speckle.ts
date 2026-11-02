/**
 * Speckle and highlight counters.
 *
 * These live beside the frame analyser rather than in the renderer that painted the pixels: the gate
 * must not import the thing it judges. They were also once gated as a fidelity rule and are not one —
 * a reference JPEG reads 0.91-2.17 specks per 1000 sampled positions while the game's own lossless
 * frames read 0.00, and that gap is compressor noise. Reported, never asserted.
 */

export interface SpeckleOptions {
  /** `countIsolatedHighlights`: own lightness floor, and every neighbour's ceiling. */
  bright?: number;
  dark?: number;
  /** `countContrastSpecks`: how far above its neighbours, and how flat they must be. */
  contrast?: number;
  flatness?: number;
  /** Sample stride. Use the block size so one sample stands for one rendered pixel. */
  step?: number;
}

/** HSL lightness, the definition core/imagemetrics uses. */
export const frameLuma = (
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): number => {
  const o = (y * width + x) * 4;
  const r = rgba[o] as number;
  const g = rgba[o + 1] as number;
  const b = rgba[o + 2] as number;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
};

const neighbours = (
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  step: number,
): number[] => [
  frameLuma(rgba, width, x - step, y),
  frameLuma(rgba, width, x + step, y),
  frameLuma(rgba, width, x, y - step),
  frameLuma(rgba, width, x, y + step),
];

/** Bright on their own with all four neighbours dark: a stuck pixel, in the instrument's units. */
export function countIsolatedHighlights(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  opts: SpeckleOptions = {},
): number {
  const { bright = 0.9, dark = 0.5, step = 1 } = opts;
  let isolated = 0;
  for (let y = step; y < height - step; y++)
    for (let x = step; x < width - step; x++)
      if (frameLuma(rgba, width, x, y) > bright && neighbours(rgba, width, x, y, step).every((l) => l < dark)) isolated++;
  return isolated;
}

/**
 * Absolute lightness is the wrong test for *this* render: the flakes were never near-white, they
 * were local maxima 0.08–0.15 above a mid-blue sky, which is exactly what a stuck subpixel looks
 * like at 384x216. So this detector looks for contrast instead: a pixel standing `contrast` above
 * all four neighbours while those neighbours are mutually flat (`flatness`). The flatness clause is
 * what separates a glitch from detail — a real edge, or JPEG-textured foliage, has neighbours that
 * disagree with each other. One sample per block when `step` is the block size.
 */
export function countContrastSpecks(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  opts: SpeckleOptions = {},
): number {
  const { contrast = 0.06, step = 1, flatness = 0.04 } = opts;
  const half = Math.floor(step / 2);
  let specks = 0;
  for (let y = half + step; y < height - step; y += step)
    for (let x = half + step; x < width - step; x += step) {
      const n = neighbours(rgba, width, x, y, step), lo = Math.min(...n);
      if (frameLuma(rgba, width, x, y) - lo >= contrast && Math.max(...n) - lo <= flatness) specks++;
    }
  return specks;
}
