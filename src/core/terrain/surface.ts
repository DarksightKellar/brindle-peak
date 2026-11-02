/**
 * Sampling a baked valley: height, normal, and what the ground is made of at a point.
 *
 * Split from heightfield.ts, which bakes the valley; createSampler there decides which height
 * function a sampler reads (with or without the gully and the bridge decks, carving.ts).
 */

import type { Heightfield, SurfaceKind, TerrainSample, TerrainSampler, ZoneDef } from '../contracts';

/** Surface thresholds. Slope is `1 - normal.y`, so 0.6 is a 66-degree face. */
const ROCK_SLOPE = 0.6;
const SPRING_SLOPE = 0.22;

/**
 * `normalAt` derives the normal by central differences at a fifth-cell step so a cliff reads as a
 * cliff rather than being averaged into a 2-unit-wide ramp.
 */
export function surface(hf: Heightfield, heightAt: (x: number, z: number) => number, zones: readonly ZoneDef[]): TerrainSampler {
  const step = Math.max(0.25, (hf.size / (hf.res - 1)) * 0.2);

  const normalAt = (x: number, z: number): { x: number; y: number; z: number } => {
    const hx = (heightAt(x + step, z) - heightAt(x - step, z)) / (2 * step);
    const hz = (heightAt(x, z + step) - heightAt(x, z - step)) / (2 * step);
    const inv = 1 / Math.sqrt(hx * hx + hz * hz + 1);
    return { x: -hx * inv, y: inv, z: -hz * inv };
  };

  const zoneAt = (x: number, z: number): number => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < zones.length; i++) {
      const z0 = zones[i];
      const d = Math.hypot(x - z0.centre.x, z - z0.centre.z) / z0.radius;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const sampleAt = (x: number, z: number): TerrainSample => {
    const n = normalAt(x, z);
    const slope = 1 - n.y;
    const zone = zones[zoneAt(x, z)];
    const dx = x - zone.centre.x;
    const dz = z - zone.centre.z;
    const inside = dx * dx + dz * dz <= zone.radius * zone.radius;

    let surface: SurfaceKind = zone.surfaceBias;
    if (slope > ROCK_SLOPE) surface = 'rock';
    else if (inside && zone.id === 'reach') surface = 'ice';
    else if (inside && zone.id === 'kettles' && slope < SPRING_SLOPE) surface = 'spring';

    return { height: heightAt(x, z), slope, surface, zone: zone.id };
  };

  return { size: hf.size, heightAt, normalAt, sampleAt };
}
