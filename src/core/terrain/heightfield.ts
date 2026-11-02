/**
 * Brindle Peak valley — generation and sampling.
 *
 * One mountain, not seven plateaus. The landform is composed in this order:
 *
 *   1. MASSIF   an exponential falloff from PEAK. This is the mountain; it sets the global
 *               "uphill is north-east" read that the whole game navigates by.
 *   2. SPUR     one knife-crest segment on the north-east flank. Windscar Ridge is a crest
 *               with steep faces, not a raised disc — that is where the 0.35-0.75 slopes live.
 *   3. ZONES    per-zone elevation-band pull. Zones never sculpt geometry from scratch; they
 *               only nudge the massif into its band, with a smooth radial weight, so the
 *               result stays one continuous landform.
 *   4. DETAIL   seeded fbm, damped at the summit and scaled by altitude.
 *   5. CHIMNEY  Nettle Chimney: an authored buttress with a near-vertical south face.
 *   6. LAKE     the Frozen Reach is flattened to a true plane, last, so nothing can re-noise it.
 *
 * All of it is baked into one Float32Array at generation time. Sampling afterwards is plain
 * bilinear interpolation: no transcendental maths, no allocation, thousands of calls per frame.
 */

import type { Heightfield, SurfaceKind, TerrainSampler, Vec2, ZoneDef, ZoneId } from '../contracts';
import { clamp, smoothstep } from '../contracts';
import { fbm2D } from '../math/noise';
import { carveGrid, DECKS, withDecks } from './carving';
import { surface } from './surface';

/** Summit elevation before the ceiling. GDD v1.1: peak ~96. */
const SUMMIT = 99;
const MASSIF_SCALE = 249;
const MASSIF_POW = 1.07;

/** Windscar Ridge crest: one segment across the north-east flank. */
const SPUR_AX = 390;
const SPUR_AZ = -170;
const SPUR_BX = 90;
const SPUR_BZ = -205;
const SPUR_AMP = 34;
const SPUR_WIDTH = 24;
const SPUR_DX = SPUR_BX - SPUR_AX;
const SPUR_DZ = SPUR_BZ - SPUR_AZ;
const SPUR_LEN2 = SPUR_DX * SPUR_DX + SPUR_DZ * SPUR_DZ;

/** Nettle Chimney — the wall. Fixed world position, fixed height, fixed face. */
const CHIMNEY_X = 250;
const CHIMNEY_Z = -240;
const CHIMNEY_RISE = 40;
/** Flat top radius. Wider than one 5.33-unit cell so the grid cannot miss it. */
const CHIMNEY_CORE = 9;
/** Width of the face. One cell wide: this is what makes the slope exceed 0.85. */
const CHIMNEY_RIM = 4.2;
/** Depth and radius of the gully at the foot of the chimney. */
const CHIMNEY_SHELF = 7;
const CHIMNEY_SHELF_R = 34;

/** The Frozen Reach ice plane. */
const LAKE_HEIGHT = 2;
const LAKE_FLAT_FRAC = 0.74;
const LAKE_EDGE_FRAC = 1.06;

/** Soft limit so a detail octave can never push a sample outside the 90..100 summit budget. */
const CEIL = 100;
const CEIL_SOFT = 1.5;

interface ZoneField {
  id: ZoneId;
  cx: number;
  cz: number;
  radius: number;
  bias: SurfaceKind;
  /** Height correction at the zone centre, faded out over the radius. */
  delta: number;
}

/** Point-to-segment distance, used by the ridge crest. */
function segmentDistance(x: number, z: number): number {
  const px = x - SPUR_AX;
  const pz = z - SPUR_AZ;
  const t = clamp((px * SPUR_DX + pz * SPUR_DZ) / SPUR_LEN2, 0, 1);
  return Math.hypot(px - SPUR_DX * t, pz - SPUR_DZ * t);
}

/** The mountain: 96 units at PEAK, decaying smoothly to the valley floor. */
function massif(x: number, z: number, peak: Vec2): number {
  const d = Math.hypot(x - peak.x, z - peak.z) / MASSIF_SCALE;
  return SUMMIT * Math.exp(-Math.pow(d, MASSIF_POW));
}

/** Windscar Ridge: a 34-unit crest, 26 units half-width, so its faces reach ~0.4 slope. */
function spur(x: number, z: number): number {
  const s = segmentDistance(x, z);
  if (s > SPUR_WIDTH * 3) return 0;
  const u = s / SPUR_WIDTH;
  return SPUR_AMP * Math.exp(-u * u);
}

/** Addition-only smooth ceiling. Identical to the input well below `CEIL`. */
function softCeiling(h: number): number {
  const u = (CEIL - h) / CEIL_SOFT;
  const sp = u > 18 ? u : Math.log1p(Math.exp(u));
  return CEIL - CEIL_SOFT * sp;
}

/** Bilinear lookup over the baked grid. Pure, allocation-free, safe outside the map. */
function bilinear(size: number, res: number, heights: Float32Array): (x: number, z: number) => number {
  const cell = size / (res - 1);
  const half = size / 2;
  const last = res - 1;
  return (x: number, z: number): number => {
    const fx = clamp((x + half) / cell, 0, last);
    const fz = clamp((z + half) / cell, 0, last);
    const ix = Math.min(Math.floor(fx), res - 2);
    const iz = Math.min(Math.floor(fz), res - 2);
    const tx = fx - ix;
    const tz = fz - iz;
    const i = iz * res + ix;
    const top = heights[i] + (heights[i + 1] - heights[i]) * tx;
    const bottom = heights[i + res] + (heights[i + res + 1] - heights[i + res]) * tx;
    return top + (bottom - top) * tz;
  };
}

/**
 * Bake the valley. Deterministic: same seed, size, resolution, zones and peak produce a
 * byte-identical Float32Array. No `Math.random`, no time, no accumulation order surprises.
 */
export function generateHeightfield(
  seed: number,
  size: number,
  res: number,
  zones: readonly ZoneDef[],
  peak: Vec2,
): Heightfield {
  const cell = size / (res - 1);
  const half = size / 2;
  const broad = fbm2D(seed + 11, 4, 2.03, 0.5);
  const fine = fbm2D(seed + 29, 3, 2.11, 0.5);

  const reach = zones.find((z) => z.id === 'reach');
  const lakeX = reach ? reach.centre.x : 0;
  const lakeZ = reach ? reach.centre.z : 0;
  const lakeR = reach ? reach.radius : 0;

  // Per-zone correction, resolved once: only zones whose centre is outside their band move
  // the terrain, and never by more than the band needs. 0.35 into the band is the floor so a
  // far-flung zone (Pinewind, the Kettles) still reads as a rise rather than a puddle.
  const fields: ZoneField[] = zones.map((z) => {
    const base = massif(z.centre.x, z.centre.z, peak) + spur(z.centre.x, z.centre.z);
    const lo = z.elevation[0] + 2;
    const hi = z.elevation[1] - 0.5;
    const floor = z.elevation[0] + (z.elevation[1] - z.elevation[0]) * 0.35;
    const target = clamp(Math.max(base, floor), lo, hi);
    return {
      id: z.id,
      cx: z.centre.x,
      cz: z.centre.z,
      radius: z.radius,
      bias: z.surfaceBias,
      delta: target - base,
    };
  });

  const heights = new Float32Array(res * res);

  for (let iz = 0; iz < res; iz++) {
    const z = -half + iz * cell;
    for (let ix = 0; ix < res; ix++) {
      const x = -half + ix * cell;

      let h = massif(x, z, peak) + spur(x, z);

      for (let k = 0; k < fields.length; k++) {
        const f = fields[k];
        const dx = x - f.cx;
        const dz = z - f.cz;
        if (dx * dx + dz * dz > f.radius * f.radius) continue;
        h += smoothstep(f.radius, 0, Math.hypot(dx, dz)) * f.delta;
      }

      const dc = Math.hypot(x - CHIMNEY_X, z - CHIMNEY_Z);
      const dPeak = Math.hypot(x - peak.x, z - peak.z);
      const amp =
        (1.5 + 2.3 * smoothstep(3, 45, h)) * smoothstep(14, 90, dPeak) * smoothstep(4, 34, dc);
      h += broad(x / 150, z / 150) * amp + fine(x / 37, z / 37) * amp * 0.35;

      // Approach shelf: the chimney stands in a gully cut into the ridge face.
      if (dc < CHIMNEY_SHELF_R * 2) {
        h -= CHIMNEY_SHELF * Math.exp(-((dc / CHIMNEY_SHELF_R) ** 2));
      }

      if (dc < CHIMNEY_CORE + CHIMNEY_RIM) {
        h += CHIMNEY_RISE * (1 - smoothstep(CHIMNEY_CORE, CHIMNEY_CORE + CHIMNEY_RIM, dc));
      }

      h = softCeiling(h);

      // The lake is applied last and wins over everything inside its basin.
      if (lakeR > 0) {
        const dl = Math.hypot(x - lakeX, z - lakeZ);
        h += (LAKE_HEIGHT - h) * smoothstep(lakeR * LAKE_EDGE_FRAC, lakeR * LAKE_FLAT_FRAC, dl);
      }

      heights[iz * res + ix] = h;
    }
  }

  return { size, res, heights, heightAt: bilinear(size, res, heights) };
}

/** The same valley without the bridge decks (the terrain mesh) and without the gully (the scatter). */
const LAYERS = new WeakMap<TerrainSampler, { ground: TerrainSampler; uncut: TerrainSampler }>();

/**
 * Sampling surface: the baked valley with the gully cut in and the bridge decks laid over it
 * (carving.ts). `heightAt` is the hot path (player collision, prop scatter, camera occlusion).
 */
export function createSampler(hf: Heightfield, zones: readonly ZoneDef[]): TerrainSampler {
  const ground = bilinear(hf.size, hf.res, carveGrid(hf.size, hf.res, hf.heights));
  const sampler = surface(hf, withDecks(ground, DECKS), zones);
  LAYERS.set(sampler, { ground: surface(hf, ground, zones), uncut: surface(hf, hf.heightAt, zones) });
  return sampler;
}

/** The ground as the terrain mesh draws it: the gully, but no bridge deck over it. */
export const groundOnly = (s: TerrainSampler): TerrainSampler => LAYERS.get(s)?.ground ?? s;

/**
 * The valley as it was baked, before the gully. The scatter places from this, so cutting the gully
 * moves no tree anywhere else (its random stream would otherwise shift); the gully is then cleared.
 */
export const beforeCuts = (s: TerrainSampler): TerrainSampler => LAYERS.get(s)?.uncut ?? s;
