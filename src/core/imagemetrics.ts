/**
 * Frame metrics — the instrument used to judge whether the render matches the benchmark.
 *
 * Director-owned and deliberately independent of the renderer: it consumes raw RGBA bytes and
 * knows nothing about three.js, the pipeline, or how the image was produced. If the instrument
 * shared code with the thing it measures, a bug would cancel itself out and the check would
 * silently pass.
 *
 * The thresholds it is compared against live in docs/ART_BIBLE.md §2 and were measured from the
 * real A Short Hike screenshots.
 */

import type { RGB } from './contracts';
import { countContrastSpecks } from './speckle';

export interface FrameMetrics {
  width: number;
  height: number;
  /**
   * Isolated high-contrast dots per 1000 sampled positions. The anti-gaming companion to detail
   * density: density alone can be satisfied by sprinkling bright specks over a flat field.
   */
  speckRate: number;
  /** Luminance percentiles (HSL lightness), 0..1. */
  p1: number;
  p5: number;
  p50: number;
  p95: number;
  min: number;
  /** Fraction of pixels below the given lightness. */
  below010: number;
  below012: number;
  /** Median saturation, 0..1. */
  satP50: number;
  /** Share of pixels brighter than L 0.90 — a proxy for blown-out snow. */
  blownShare: number;
  /** Population standard deviation of luminance — readable contrast. */
  contrast: number;
  /** Mean local gradient magnitude, 0..1 — how much structure survives. */
  edgeDensity: number;
  /** Share of saturation-weighted chroma falling in each band, 0..1. */
  coolShare: number;
  warmShare: number;
  /** Detected nearest-neighbour block period in device pixels; 2 means "not pixelated". */
  blockPeriod: number;
}

const toL = (r: number, g: number, b: number): number =>
  (Math.max(r, g, b) + Math.min(r, g, b)) / 510;

const toSat = (r: number, g: number, b: number): number => {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 510;
  if (mx === mn) return 0;
  return (mx - mn) / (1 - Math.abs(2 * l - 1) || 1e-6) / 255;
};

const toHue = (r: number, g: number, b: number): number => {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d === 0) return 0;
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
};

/**
 * Nearest-rank percentile. Uses floor, not round: with an even distribution `round` pushes the
 * median one sample into the upper half, which silently shifts p50 by a whole band.
 */
const percentile = (sorted: Float32Array, p: number): number => {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[i] as number;
};

/**
 * Detect the pixel block size by finding the k at which the image becomes block-constant.
 * This is the same method used to measure the reference screenshots, and it is robust to the
 * compression noise that defeats naive run-length counting.
 */
export function detectBlockPeriod(
  luma: Float32Array,
  width: number,
  height: number,
  maxK = 12,
): number {
  let bestK = 2;
  let bestVar = Infinity;
  for (let k = 2; k <= maxK; k++) {
    let bestForK = Infinity;
    for (let oy = 0; oy < k; oy++) {
      for (let ox = 0; ox < k; ox++) {
        const cols = Math.floor((width - ox) / k);
        const rows = Math.floor((height - oy) / k);
        if (cols < 4 || rows < 4) continue;
        let within = 0;
        let n = 0;
        for (let by = 0; by < rows; by++) {
          for (let bx = 0; bx < cols; bx++) {
            let sum = 0;
            let sumSq = 0;
            for (let y = 0; y < k; y++) {
              const row = (oy + by * k + y) * width + ox + bx * k;
              for (let x = 0; x < k; x++) {
                const v = luma[row + x] as number;
                sum += v;
                sumSq += v * v;
              }
            }
            const mean = sum / (k * k);
            within += sumSq / (k * k) - mean * mean;
            n++;
          }
        }
        const v = n > 0 ? within / n : Infinity;
        if (v < bestForK) bestForK = v;
      }
    }
    if (bestForK < bestVar) {
      bestVar = bestForK;
      bestK = k;
    }
  }
  return bestK;
}

/** Analyse an RGBA frame. `rgba.length` must be width*height*4. */
export function analyseFrame(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): FrameMetrics {
  const n = width * height;
  const luma = new Float32Array(n);
  const sats = new Float32Array(n);
  let below010 = 0;
  let below012 = 0;
  let cool = 0;
  let warm = 0;
  let chromaTotal = 0;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = rgba[o] as number;
    const g = rgba[o + 1] as number;
    const b = rgba[o + 2] as number;
    const l = toL(r, g, b);
    const s = toSat(r, g, b);
    luma[i] = l;
    sats[i] = s;
    if (l < 0.1) below010++;
    if (l < 0.12) below012++;
    chromaTotal += s;
    if (s > 0.12) {
      const h = toHue(r, g, b);
      if (h >= 195 && h <= 250) cool += s;
      if (h >= 20 && h <= 50) warm += s;
    }
  }

  const sortedL = Float32Array.from(luma).sort();
  const sortedS = Float32Array.from(sats).sort();

  let mean = 0;
  for (let i = 0; i < n; i++) mean += luma[i] as number;
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = (luma[i] as number) - mean;
    variance += d * d;
  }

  // Mean local gradient: how much structure survives the pixelation.
  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const i = y * width + x;
      const dx = Math.abs((luma[i] as number) - (luma[i - 1] as number));
      const dy = Math.abs((luma[i] as number) - (luma[i - width] as number));
      edgeSum += dx + dy;
      edgeCount++;
    }
  }

  let blown = 0;
  for (let i = 0; i < n; i++) if ((luma[i] as number) > 0.9) blown++;

  return {
    width,
    height,
    p1: percentile(sortedL, 1),
    p5: percentile(sortedL, 5),
    p50: percentile(sortedL, 50),
    p95: percentile(sortedL, 95),
    min: sortedL[0] ?? 0,
    below010: below010 / n,
    below012: below012 / n,
    satP50: percentile(sortedS, 50),
    blownShare: blown / n,
    contrast: Math.sqrt(variance / n),
    edgeDensity: edgeCount > 0 ? edgeSum / (edgeCount * 2) : 0,
    coolShare: chromaTotal > 0 ? cool / chromaTotal : 0,
    warmShare: chromaTotal > 0 ? warm / chromaTotal : 0,
    blockPeriod: detectBlockPeriod(luma, width, height),
    speckRate:
      // One sample per internal pixel: analyseFrame sees the 384x216 buffer, not the upscaled canvas.
      (countContrastSpecks(rgba, width, height, { step: 1 }) /
        Math.max(1, (width - 2) * (height - 2))) *
      1000,
  };
}

/** Convenience for reporting a frame's metrics as one compact line. */
export const formatMetrics = (m: FrameMetrics): string =>
  `L p1=${m.p1.toFixed(3)} p50=${m.p50.toFixed(3)} p95=${m.p95.toFixed(3)} min=${m.min.toFixed(3)} ` +
  `dark=${(m.below010 * 100).toFixed(2)}% S=${m.satP50.toFixed(2)} ` +
  `cool=${(m.coolShare * 100).toFixed(0)}% warm=${(m.warmShare * 100).toFixed(0)}% ` +
  `blown=${(m.blownShare * 100).toFixed(1)}% edge=${m.edgeDensity.toFixed(4)} ` +
  `specks=${m.speckRate.toFixed(2)} block=${m.blockPeriod}`;

/** Sample a pixel from a raw RGBA buffer. */
export const rgbAt = (rgba: Uint8Array, width: number, x: number, y: number): RGB => {
  const o = (y * width + x) * 4;
  return {
    r: (rgba[o] as number) / 255,
    g: (rgba[o + 1] as number) / 255,
    b: (rgba[o + 2] as number) / 255,
  };
};


// ---------------------------------------------------------------------------
// Speckle detection — the anti-gaming companion to detail density.
//
// Detail density rises with noise: bright dots sprinkled over a flat field will satisfy a density
// threshold while looking like confetti. This project proved it on itself — a near-field clutter
// field lifted mean density from 0.0021 to 0.0069 with 2,700 uniformly distributed blobs, and the
// rendered result read as "uniform confetti, like a tiled texture".
//
// The discriminator is neighbour consensus. A pixel standing well above all four neighbours, while
// those neighbours agree with each other, is a stuck subpixel or a confetti dot. A real edge, or
// textured foliage, has neighbours that disagree. Moved here from the renderer so the gate cannot
// import the thing it judges.
// ---------------------------------------------------------------------------

