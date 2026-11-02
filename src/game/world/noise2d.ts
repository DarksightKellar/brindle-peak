/**
 * Tileable 2D noise for authored ground textures.
 *
 * Everything here is periodic in the unit square: the lattice index is taken modulo `period`, so a
 * texture built from these repeats seamlessly when its UVs wrap. Every generator is pure and
 * deterministic — no Math.random — so a texture is byte-identical on every machine and in every
 * unit test.
 */

/** Deterministic integer hash -> 0..1. */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695040) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothstep-interpolated value noise on a lattice that wraps every `period` cells. */
export function vnoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wx0 = ((x0 % period) + period) % period;
  const wy0 = ((y0 % period) + period) % period;
  const wx1 = (wx0 + 1) % period;
  const wy1 = (wy0 + 1) % period;
  const a = hash2(wx0, wy0, seed);
  const b = hash2(wx1, wy0, seed);
  const c = hash2(wx0, wy1, seed);
  const d = hash2(wx1, wy1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

/** Fractal sum, 0..1. Each octave doubles the lattice frequency, so the sum stays periodic. */
export function fbm(u: number, v: number, period: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(u, v, period << o, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
