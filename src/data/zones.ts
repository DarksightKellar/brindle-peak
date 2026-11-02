/**
 * The valley, as content. Pure data: the generator reads these bands, the scatter reads
 * `snowDensity`, the UI reads `id`. Nothing here knows about height or rendering.
 *
 * Coordinates are world units, origin-centred, +/-WORLD_SIZE/2. +x is east, -z is north;
 * the mountain rises toward the north-east corner, where PEAK sits.
 */

import type { Vec2, Vec3, ZoneDef } from '../core/contracts';

/** Square world extent. Valid coordinates run from -512 to +512 on both axes. */
export const WORLD_SIZE = 1024;

/**
 * The world seed. One constant, because it used to be 1337 in the game and 20261020 in two of the
 * test files — meaning the props and terrain tests were validating a mountain the player never
 * walks on. Content positions were authored against 1337, so that is the shipped value.
 */
export const WORLD_SEED = 1337;
/** Heightfield samples per side. */
export const WORLD_RES = 192;

/** Brindle Peak: the summit, and the target of the base rise in the heightfield. */
export const PEAK: Vec2 = { x: 330, z: -360 };

/**
 * Arrival point at Hearth Hollow station. `y` is nominal; the bootstrap re-samples it from the
 * terrain sampler so the player never spawns inside the ground.
 *
 * Chosen for the opening frame, which has to show where to go: west of the cabin, 14 u from Nana at
 * the door (the walk beat completes at 12 u, about when she comes into reach), with no pine between
 * the camera and Pip, so nothing dissolves in the first frame. The station faces this point, so the
 * door is in view.
 */
export const SPAWN: Vec3 = { x: -372, y: 5, z: 358 };
/**
 * Fresh-run heading at SPAWN. The chase camera starts behind it, which puts Nana and the cabin door
 * right of Pip and the bearing of Brindle Peak left of Pip. Facing the peak itself put the cabin
 * roof in front of it. Re-check if SPAWN, Nana or the station move.
 */
export const SPAWN_FACING = (126 * Math.PI) / 180;

export const ZONES: readonly ZoneDef[] = [
  {
    id: 'hearth',
    centre: { x: -330, z: 330 },
    radius: 115,
    elevation: [4, 14],
    surfaceBias: 'snow',
    snowDensity: 0.35,
  },
  {
    id: 'pinewind',
    centre: { x: -230, z: 130 },
    radius: 190,
    elevation: [10, 40],
    surfaceBias: 'deep-snow',
    snowDensity: 0.9,
  },
  {
    id: 'reach',
    centre: { x: 120, z: 380 },
    radius: 190,
    elevation: [0, 10],
    surfaceBias: 'ice',
    snowDensity: 0.2,
  },
  {
    id: 'kettles',
    centre: { x: -40, z: 60 },
    radius: 130,
    elevation: [16, 34],
    surfaceBias: 'spring',
    snowDensity: 0.5,
  },
  {
    id: 'hamlet',
    centre: { x: 250, z: 120 },
    radius: 120,
    elevation: [12, 26],
    surfaceBias: 'path',
    snowDensity: 0.4,
  },
  {
    id: 'ridge',
    centre: { x: 240, z: -190 },
    radius: 175,
    elevation: [44, 80],
    surfaceBias: 'rock',
    snowDensity: 0.7,
  },
  {
    id: 'peak',
    centre: { x: 330, z: -360 },
    radius: 105,
    elevation: [60, 96],
    surfaceBias: 'rock',
    snowDensity: 0.5,
  },
];
