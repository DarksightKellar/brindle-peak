/**
 * Seeded value noise. Pure: no `Math.random`, no time, no globals.
 *
 * The world is generated once per seed and every downstream system (scatter, props,
 * landmarks) replays the same functions, so identical inputs must produce identical
 * floats on every machine. Value noise is used rather than gradient noise because its
 * maxima sit exactly on lattice points, which keeps ridge lines and summits predictable
 * when the designer wants to sculpt around them.
 */

/** Quintic fade — C2 continuous, so the interpolant has no visible lattice creases. */
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * 32-bit integer hash of a lattice cell, mapped to 0..1.
 * `Math.imul` keeps every step in int32 so results are identical on all engines.
 */
function hash01(seed: number, ix: number, iz: number): number {
  let h = (seed | 0) ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Bilinear value noise over the unit lattice. Returns -1..1. */
export function valueNoise2D(seed: number): (x: number, z: number) => number {
  return (x: number, z: number): number => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const tx = fade(x - ix);
    const tz = fade(z - iz);

    const a = hash01(seed, ix, iz);
    const b = hash01(seed, ix + 1, iz);
    const c = hash01(seed, ix, iz + 1);
    const d = hash01(seed, ix + 1, iz + 1);

    const top = a + (b - a) * tx;
    const bottom = c + (d - c) * tx;
    return (top + (bottom - top) * tz) * 2 - 1;
  };
}

/** Per-octave lattice offsets, so octaves do not share lattice points and read as a stack of grids. */
const OFFSET_X = 137.31;
const OFFSET_Z = 219.17;

/**
 * Fractal brownian motion over `valueNoise2D`. Normalised by the summed amplitude, so the
 * result stays inside approximately -1..1 regardless of octave count or gain.
 */
export function fbm2D(
  seed: number,
  octaves: number,
  lacunarity: number,
  gain: number,
): (x: number, z: number) => number {
  const layers: Array<(x: number, z: number) => number> = [];
  let norm = 0;
  let amp = 1;
  for (let i = 0; i < octaves; i++) {
    // 7919 is prime: consecutive seeds land on unrelated lattice planes.
    layers.push(valueNoise2D(seed + i * 7919));
    norm += amp;
    amp *= gain;
  }
  const inverseNorm = norm > 0 ? 1 / norm : 1;

  return (x: number, z: number): number => {
    let sum = 0;
    let frequency = 1;
    let amplitude = 1;
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      sum += amplitude * layer(x * frequency + i * OFFSET_X, z * frequency + i * OFFSET_Z);
      frequency *= lacunarity;
      amplitude *= gain;
    }
    return sum * inverseNorm;
  };
}
