/**
 * Where each fishing post's water is.
 *
 * The float used to be dropped 3.4 u in front of the camera on whatever was there, which at Kettle
 * Springs was bare ground beside the pool. Each post now names its water and the activity post stands
 * on it (data/activities.ts), so the prompt floats over the water and the float lands on it:
 *
 *   world  a pool the world already draws (landmarks.ts SPRING_POOLS): nothing is added.
 *   pool   a small dark pool ringed with stones, added by this file where the valley has no water of its
 *          own (the creek pool in Pinewind, the tarn on the ridge). Laid on the flattest ground near the
 *          old post and tipped to the slope under it, so no edge floats or sinks.
 *   hole   a hole cut in the Frozen Reach ice, with the cut ice heaped round it.
 *
 * The added pools and holes are kept pieces: the marker layer stands them up at boot along with the
 * finished builds (buildSites.ts finishedBuildMarkers).
 */

import type { TerrainSampler, Vec3 } from '../../core/contracts';
import type { PlacedMarker } from './markerLooks';

export interface FishSpot {
  x: number;
  z: number;
  /** Water radius. */
  r: number;
  dressed: 'world' | 'pool' | 'hole';
}

export const FISH_SPOTS: Readonly<Record<string, FishSpot>> = {
  // The middle basin of the springs, the one with the tallest steam.
  'kettles-spring-fish': { x: -40, z: 60, r: 3.4, dressed: 'world' },
  'pinewind-creek-fish': { x: -246, z: 121, r: 2.3, dressed: 'pool' },
  'reach-ice-fish': { x: 110, z: 352, r: 1.6, dressed: 'hole' },
  'ridge-tarn-fish': { x: 304, z: -222, r: 2.3, dressed: 'pool' },
};

export function fishSpotFor(id: string): FishSpot | null {
  return FISH_SPOTS[id] ?? null;
}

/**
 * The Reach ice sheet stands this high (world/water.ts ICE_SURFACE_Y, not imported: that module builds
 * meshes). A hole has to be cut in the ice, not drawn on the lake bed underneath it.
 */
const ICE_Y = 2.02;

/** Ground under a spot: the ice for a hole, the terrain otherwise. */
function groundAt(spot: FishSpot, terrain: TerrainSampler): number {
  const h = terrain.heightAt(spot.x, spot.z);
  return spot.dressed === 'hole' ? Math.max(h, ICE_Y) : h;
}

/** Height of the water surface at a spot (a world pool's disc sits 0.06 above the ground). */
export function waterLevel(spot: FishSpot, terrain: TerrainSampler): number {
  return groundAt(spot, terrain) + (spot.dressed === 'hole' ? 0.05 : 0.06);
}

/**
 * Where the float rests: on the water, a little way out from the side the player stands on, so it is
 * between Pip and the middle of the pool and in front of the camera.
 */
export function floatPoint(spot: FishSpot, from: { x: number; z: number }, terrain: TerrainSampler): Vec3 {
  const dx = from.x - spot.x;
  const dz = from.z - spot.z;
  const len = Math.hypot(dx, dz) || 1;
  const out = spot.r * 0.3;
  return { x: spot.x + (dx / len) * out, y: waterLevel(spot, terrain) + 0.1, z: spot.z + (dz / len) * out };
}

/**
 * Where Pip stands to fish: on the bank (or beyond the heaped ice), on the side they walked up from,
 * facing the middle. The prompt catches the player anywhere inside the post's radius, which at the ice
 * hole meant standing on the hole itself with the float under their feet.
 */
export function standPoint(spot: FishSpot, from: { x: number; z: number }, terrain: TerrainSampler): Vec3 & { yaw: number } {
  const dx = from.x - spot.x;
  const dz = from.z - spot.z;
  const len = Math.hypot(dx, dz);
  const ux = len > 0.01 ? dx / len : 0;
  const uz = len > 0.01 ? dz / len : 1;
  const out = spot.dressed === 'hole' ? spot.r * 1.45 + 1.1 : spot.r + 0.9;
  const x = spot.x + ux * out;
  const z = spot.z + uz * out;
  const h = terrain.heightAt(x, z);
  return { x, y: spot.dressed === 'hole' ? Math.max(h, ICE_Y) : h, z, yaw: Math.atan2(-ux, -uz) };
}

/** The added pools and ice holes, as kept pieces tipped to the ground under them. */
export function fishSpotMarkers(terrain: TerrainSampler): PlacedMarker[] {
  const out: PlacedMarker[] = [];
  for (const [id, spot] of Object.entries(FISH_SPOTS)) {
    if (spot.dressed === 'world') continue;
    const n = terrain.normalAt(spot.x, spot.z);
    const flat = Math.hypot(n.x, n.z);
    // Local +X turned onto the downhill direction, then tipped down by the slope angle.
    const yaw = flat > 1e-4 ? Math.atan2(-n.z, n.x) : 0;
    const tilt = -Math.atan2(flat, n.y);
    out.push({
      shape: 'lump', look: spot.dressed, keep: `fish:${id}`,
      x: spot.x, y: groundAt(spot, terrain), z: spot.z, yaw, tilt, size: spot.r,
    });
  }
  return out;
}
