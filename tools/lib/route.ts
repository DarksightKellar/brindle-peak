/**
 * The route to the mast, and a walk along it.
 *
 * Shared by `route-walk.ts` (can the player finish?) and `reward-cadence.ts` (does the walk pay out?).
 * Both need the same path, and a second copy of the flood fill would drift from the one
 * `tests/connectivity.test.ts` enforces — this project has already been bitten twice by a
 * duplicated constant.
 *
 * The walkability rule is the unit test's, exactly: an eight-way flood fill where a step is refused if
 * the ground rises more than `MAX_STEP`, diagonals included, and the goal is any cell within two of the
 * peak. It is a *necessary* condition — it ignores stamina — which is why the walk below exists.
 */

import { createSampler, generateHeightfield } from '../../src/core/terrain/heightfield';
import { PEAK, SPAWN, WORLD_RES, WORLD_SEED, WORLD_SIZE, ZONES } from '../../src/data/zones';

export const CELL = 1.5;
export const MAX_STEP = 1.15;
export const HALF = WORLD_SIZE / 2;

export type Sampler = ReturnType<typeof createSampler>;

export function makeSampler(): Sampler {
  return createSampler(
    generateHeightfield(WORLD_SEED, WORLD_SIZE, WORLD_RES, ZONES, PEAK), ZONES,
  );
}

export interface Point { x: number; z: number }

export function route(sampler: Sampler): Point[] {
  const n = Math.floor(WORLD_SIZE / CELL);
  const h = (gx: number, gz: number): number => sampler.heightAt(-HALF + gx * CELL, -HALF + gz * CELL);
  const start = Math.round((SPAWN.z + HALF) / CELL) * n + Math.round((SPAWN.x + HALF) / CELL);
  const goalX = Math.round((PEAK.x + HALF) / CELL);
  const goalZ = Math.round((PEAK.z + HALF) / CELL);
  const atGoal = (idx: number): boolean => {
    const gx = idx % n;
    const gz = (idx - gx) / n;
    return Math.abs(gx - goalX) <= 2 && Math.abs(gz - goalZ) <= 2;
  };

  const parent = new Int32Array(n * n).fill(-1);
  const seen = new Uint8Array(n * n);
  const queue: number[] = [start];
  seen[start] = 1;

  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    if (atGoal(idx)) break;
    const gx = idx % n;
    const gz = (idx - gx) / n;
    const here = h(gx, gz);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nx = gx + dx;
        const nz = gz + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const ni = nz * n + nx;
        if (seen[ni]) continue;
        if (h(nx, nz) - here > MAX_STEP) continue;
        seen[ni] = 1;
        parent[ni] = idx;
        queue.push(ni);
      }
    }
  }

  let end = -1;
  for (let i = 0; i < seen.length; i++) if (seen[i] && atGoal(i)) { end = i; break; }
  if (end < 0) throw new Error('no slope-limited route to the peak exists');

  const path: Point[] = [];
  for (let at = end; at !== -1; at = parent[at]) {
    const gx = at % n;
    const gz = (at - gx) / n;
    path.push({ x: -HALF + gx * CELL, z: -HALF + gz * CELL });
  }
  return path.reverse();
}

/** Total ground covered by a path, in world units. */
export function pathLength(path: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  }
  return total;
}
