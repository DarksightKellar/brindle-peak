/**
 * The ground as it is drawn: which grid the terrain mesh uses, how each cell is split, and the
 * height of the drawn triangle at any point.
 *
 * The mesh sits exactly on the heightfield's own grid, so every vertex is a baked height. Inside a
 * cell `heightAt` is bilinear, which is a gentle saddle, while the mesh draws two flat triangles.
 * Either diagonal can bulge above the saddle or sag below it, and above is the bad one: Pip stands on
 * `heightAt`, so a bulge drew him inside the ground (worst at the foot of the ridge spikes, where a
 * coarser grid of its own put the mesh a whole unit and more over him). So each cell is split along
 * whichever diagonal is lower; the drawn ground then never rises above the ground Pip stands on.
 *
 * Anything laid flat on the snow (the creek, a pool of lamplight) uses `groundHeightAt` to sit
 * exactly on what the player sees rather than sinking into one triangle and floating over the next.
 */

import type { TerrainSampler } from '../../core/contracts';
import { WORLD_RES } from '../../data/zones';

/** Vertices per side: the heightfield's own resolution, so the vertices are its samples. */
export const MESH_RES = WORLD_RES;

/**
 * True when a cell with these corner heights is split along its (x1, z0)-(x0, z1) diagonal, false for
 * (x0, z0)-(x1, z1). The lower of the two diagonals keeps both triangles under the bilinear surface.
 */
export function splitsAntiDiagonal(h00: number, h10: number, h01: number, h11: number): boolean {
  return h10 + h01 <= h00 + h11;
}

export function groundHeightAt(sampler: TerrainSampler, x: number, z: number): number {
  const cell = sampler.size / (MESH_RES - 1);
  const half = sampler.size / 2;
  const fi = Math.min(MESH_RES - 2, Math.max(0, Math.floor((x + half) / cell)));
  const fj = Math.min(MESH_RES - 2, Math.max(0, Math.floor((z + half) / cell)));
  const x0 = -half + fi * cell;
  const z0 = -half + fj * cell;
  const u = (x - x0) / cell;
  const v = (z - z0) / cell;
  const h00 = sampler.heightAt(x0, z0);
  const h10 = sampler.heightAt(x0 + cell, z0);
  const h01 = sampler.heightAt(x0, z0 + cell);
  const h11 = sampler.heightAt(x0 + cell, z0 + cell);
  if (splitsAntiDiagonal(h00, h10, h01, h11)) {
    if (u + v <= 1) return h00 + u * (h10 - h00) + v * (h01 - h00);
    return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  }
  if (u >= v) return h00 + u * (h10 - h00) + v * (h11 - h10);
  return h00 + v * (h01 - h00) + u * (h11 - h01);
}
