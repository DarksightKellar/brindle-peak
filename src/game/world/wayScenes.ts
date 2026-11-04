/**
 * Things worth stopping for on the way up, one every 20-30 seconds of walking.
 *
 * The climb is ~1100 u, and most of it crossed open basins with nothing in them: the Kettles floor,
 * the snow beyond it, the foot of the ridge. A Short Hike's trail is never more than a few seconds
 * from the next small thing. These are placed by distance along WAY_UP (trail.ts), beside it, so a
 * player walking at the goal passes each one; five of them hold a feather (pickups.ts).
 *
 *   s   ~190  the ride: a woodcutters' sledge left half loaded, a stack of rounds, an axe in a block
 *   s   ~315  a frozen stream across the ride, and a plank footbridge over it
 *   s   ~400  Kettle Springs (kettlesDressing.ts): stones, dead trees, a bench and a boardwalk
 *   s   ~515  a glacial erratic, a house-sized boulder alone on the snow
 *   s   ~630  a small frozen pond with reeds
 *   s   ~700  a stone bothy at the ridge foot, where the trail turns: shelter, bench, firewood
 *   s   ~880  on the shelf, Tuck's bridge over the gully (tuckBridge.ts), a stream frozen on its floor
 *             and icicles hung off its walls
 *   s  ~1060  rime-feathered rocks on the summit slope, and a cairn below the mast
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import type { Occluder } from '../camera/occlusion';
import { GEO, GeoBuilder, propMatrix } from './geoBuilder';
import { frozenPond, frozenStream, icicles } from './frozenWater';
import { WAY_UP } from './trail';
import { GULLY_X as GX } from '../../core/terrain/carving';
import { groundOnly } from '../../core/terrain/heightfield';

/** The point `s` u along the trail, pushed `side` u to the right of the direction of travel. */
function along(s: number, side: number): { x: number; z: number; yaw: number } {
  let left = s;
  for (let i = 0; i < WAY_UP.length - 1; i++) {
    const [ax, az] = WAY_UP[i];
    const [bx, bz] = WAY_UP[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (left <= len || i === WAY_UP.length - 2) {
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      return { x: ax + dx * left - dz * side, z: az + dz * left + dx * side, yaw: Math.atan2(dx, dz) };
    }
    left -= len;
  }
  return { x: WAY_UP[0][0], z: WAY_UP[0][1], yaw: 0 };
}

/** A log lying along z from a to c, bark with a sawn pale end toward a. */
function log(b: GeoBuilder, a: [number, number, number], c: [number, number, number], r: number): void {
  b.strut(a, c, r, 'BARK');
  b.add(GEO.stump, propMatrix(a[0], a[1], a[2] - 0.03, r * 0.92, 0.08, r * 0.92, 0, Math.PI / 2), 'WOOD_LT');
}

/** The woodcutters' sledge, a stack of rounds and an axe in the block. Local +z is along the trail. */
function sledge(b: GeoBuilder): void {
  for (const sx of [-0.55, 0.55]) {
    b.strut([sx, 0.08, -1.6], [sx, 0.08, 1.3], 0.06, 'WOOD_DK');
    b.strut([sx, 0.08, 1.3], [sx, 0.55, 1.75], 0.06, 'WOOD_DK');
  }
  b.box(0, 0.3, -0.15, 1.4, 0.1, 2.9, 'WOOD_MID', 'SNOW_LT');
  for (const [x, y] of [[-0.3, 0.6], [0.3, 0.6], [0, 0.98]] as const) log(b, [x, y, -1.3], [x, y, 1.1], 0.27);
  b.strut([0, 0.55, 1.75], [0.4, 0.05, 3.2], 0.03, 'BRUSH');
  // The stack: three, two, one, snow on the top.
  for (const [x, y] of [[-0.6, 0.25], [0, 0.25], [0.6, 0.25], [-0.3, 0.72], [0.3, 0.72], [0, 1.18]] as const) {
    log(b, [x - 2.6, y, -0.6], [x - 2.6, y, 0.6], 0.25);
  }
  b.box(-2.6, 1.38, 0, 0.7, 0.1, 1.1, 'SNOW_LT', 'SNOW_HI');
  b.add(GEO.stump, propMatrix(2.1, 0.3, 0.6, 0.45, 0.6, 0.45), 'BARK', 'WOOD_LT');
  b.strut([2.1, 0.62, 0.6], [2.5, 1.35, 0.8], 0.04, 'WOOD_LT');
  b.box(2.1, 0.55, 0.62, 0.08, 0.18, 0.3, 'ROCK_DK');
}

/** Plank footbridge, spanning local z from -len/2 to len/2, sat on two log stringers. */
function footbridge(b: GeoBuilder, len: number): void {
  for (const sx of [-0.7, 0.7]) b.strut([sx, 0.15, -len / 2], [sx, 0.15, len / 2], 0.13, 'BARK');
  for (let z = -len / 2 + 0.25; z < len / 2; z += 0.42) b.box(0, 0.24, z, 1.8, 0.08, 0.34, 'WOOD_LT', 'SNOW_LT');
  for (const sx of [-0.85, 0.85]) {
    for (const z of [-len / 2 + 0.3, len / 2 - 0.3]) b.cyl(sx, 0, z, 0.06, 1.1, 'WOOD_DK');
    b.strut([sx, 1.05, -len / 2 + 0.3], [sx, 1.05, len / 2 - 0.3], 0.04, 'WOOD_MID');
  }
}

/** A house-sized boulder dropped by the ice, alone on the snow, and two of its chips. */
function erratic(b: GeoBuilder): void {
  b.add(GEO.ico, propMatrix(0, 2.1, 0, 3.4, 2.7, 3.0, 0.4), 'ROCK_MID', 'ROCK_SNOWCAP', 0.45);
  b.add(GEO.ico, propMatrix(1.2, 3.6, -0.5, 1.9, 1.5, 1.7, 1.3), 'ROCK_LT', 'ROCK_SNOWCAP', 0.45);
  b.add(GEO.ico, propMatrix(-4.2, 0.4, 1.6, 0.9, 0.7, 0.8, 0.9), 'ROCK_DK', 'SNOW_LT', 0.5);
  b.add(GEO.tetra, propMatrix(3.9, 0.3, 2.2, 0.7, 0.55, 0.6, 2.1), 'ROCK_WARM', 'SNOW_LT', 0.5);
}

/**
 * A stone shelter at the ridge foot: thick walls, a slab roof under snow, a bench, the woodpile, and
 * a lamp in the window. The north face is in shade all day, so the bothy stands in blue; the one warm
 * window is what you see of it from the springs, and what says someone looks after this road.
 */
function bothy(b: GeoBuilder): void {
  const w = 4.4, d = 3.4, h = 2.1;
  b.box(0, -0.6, 0, w, h + 0.6, d, 'ROCK_WARM');
  for (const sx of [-1, 1]) {
    b.add(GEO.box, propMatrix(sx * (w / 4 + 0.15), h + 0.55, 0, w / 2 + 0.4, 0.18, d + 0.7, 0, 0, -sx * 0.42), 'ROCK_DK', 'SNOW_LT', 0.5);
    b.add(GEO.box, propMatrix(sx * (w / 4 + 0.15), h + 0.72, 0, w / 2 + 0.3, 0.16, d + 0.6, 0, 0, -sx * 0.42), 'SNOW_LT', 'SNOW_HI', 0.5);
  }
  b.tri([-w / 2, h, d / 2], [w / 2, h, d / 2], [0, h + 1.1, d / 2], 'ROCK_WARM', [0, h, d]);
  b.tri([w / 2, h, -d / 2], [-w / 2, h, -d / 2], [0, h + 1.1, -d / 2], 'ROCK_WARM', [0, h, -d]);
  b.box(-0.7, 0, d / 2 + 0.02, 0.9, 1.7, 0.08, 'WOOD_DK');
  b.box(1.2, 0.95, d / 2 + 0.02, 0.76, 0.66, 0.06, 'WOOD_DK');
  b.glow();
  b.add(GEO.quad, propMatrix(1.2, 1.28, d / 2 + 0.06, 0.6, 0.5, 1), 'LANTERN');
  b.glow(false);
  b.box(1.0, 0, d / 2 + 0.55, 1.6, 0.45, 0.45, 'WOOD_LT', 'SNOW_LT');
  b.cyl(w / 2 - 0.6, h, -0.6, 0.28, 1.4, 'ROCK_DK');
  for (const [z, y] of [[-0.9, 0.25], [-0.3, 0.25], [0.3, 0.25], [-0.6, 0.7], [0, 0.7]] as const) {
    log(b, [w / 2 + 0.35, y, z], [w / 2 + 1.3, y, z], 0.24);
  }
}

/** A rock with rime grown into the wind on it: white feathers of ice leaning one way. */
function rimeRock(b: GeoBuilder, x: number, z: number, y: number, s: number, seed: number): void {
  b.add(GEO.ico, propMatrix(x, y + 0.5 * s, z, 1.3 * s, 0.9 * s, 1.1 * s, seed), 'ROCK_DK', 'ROCK_SNOWCAP', 0.5);
  for (let i = 0; i < 5; i++) {
    const a = seed + i * 0.6;
    const ox = x + Math.cos(a) * 0.5 * s, oz = z - 0.6 * s + Math.sin(a) * 0.3 * s;
    b.add(GEO.tetra, propMatrix(ox, y + (0.7 + 0.15 * i) * s, oz, 0.22 * s, 0.6 * s, 0.5 * s, a, -0.9), i % 2 ? 'SNOW_HI' : 'ICE_HI');
  }
}

export interface WayScenes {
  group: THREE.Group;
  colliders: Collider[];
  occluders: Occluder[];
  /** Discs the scatter is cleared from, so nothing grows through a scene. */
  clearings: { x: number; z: number; r: number }[];
}

/** Where each scene stands; computed once, so clearings are known before the scatter is built. */
const SLEDGE = along(190, 6.5);
const BRIDGE = { x: -131.5, z: 111 };
const ERRATIC = along(515, 7.5);
const POND = { x: 110, z: -90 };
const BOTHY = { x: 128, z: -148 };
/** Down the gully floor (core/terrain/carving.ts), under the bridge and out onto the shelf. */
const CASCADE: readonly (readonly [number, number])[] = [[GX, -209], [GX, -218], [GX, -227], [GX, -236], [GX, -247], [GX, -258]];
const RIME: readonly (readonly [number, number, number])[] = [[268, -294, 1], [287, -300, 1.3], [291, -316, 0.9], [279, -285, 0.8]];
const CAIRN = { x: 314.4, z: -333.2 };

export const SCENE_CLEARINGS: readonly { x: number; z: number; r: number }[] = [
  { ...SLEDGE, r: 5 }, { ...BRIDGE, r: 5 }, { ...ERRATIC, r: 7 }, { ...POND, r: 8 }, { ...BOTHY, r: 7 },
  ...RIME.map(([x, z]) => ({ x, z, r: 2.5 })), { ...CAIRN, r: 2 },
];

export function buildWayScenes(sampler: TerrainSampler): WayScenes {
  const group = new THREE.Group();
  group.name = 'way-scenes';
  const y = (x: number, z: number): number => sampler.heightAt(x, z);
  const place = (b: GeoBuilder, name: string, x: number, z: number, yaw: number): void => {
    const mesh = b.finish(name);
    mesh.position.set(x, y(x, z), z);
    mesh.rotation.y = yaw;
    mesh.userData.noCollide = true;
    group.add(mesh);
  };

  const s = new GeoBuilder();
  sledge(s);
  place(s, 'woodcutters-sledge', SLEDGE.x, SLEDGE.z, SLEDGE.yaw);

  group.add(frozenStream(sampler, [[-152, 76], [-141, 95], [-131.5, 111], [-121, 127], [-110, 141], [-98, 154]], 2.4, 1.4, { ...BRIDGE, r: 4 }));
  const fb = new GeoBuilder();
  footbridge(fb, 5.6);
  place(fb, 'footbridge', BRIDGE.x, BRIDGE.z, along(315, 0).yaw);

  const e = new GeoBuilder();
  erratic(e);
  place(e, 'erratic', ERRATIC.x, ERRATIC.z, 0.6);

  group.add(frozenPond(sampler, POND.x, POND.z, 5));
  const reeds = new GeoBuilder();
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + 2.4, r = 5.6 + (i % 3) * 0.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    reeds.strut([x, -0.1, z], [x + 0.1, 1.1 + (i % 2) * 0.4, z + 0.05], 0.035, 'BRUSH');
    reeds.strut([x + 0.2, -0.1, z], [x + 0.35, 0.9, z - 0.1], 0.03, 'WOOD_MID');
  }
  place(reeds, 'pond-reeds', POND.x, POND.z, 0);

  const bo = new GeoBuilder();
  bothy(bo);
  // Door toward the trail, which runs north of it.
  place(bo, 'bothy', BOTHY.x, BOTHY.z, Math.PI);

  // On the ground under the bridge, not on its deck: the deck is an overlay on the sampler.
  const floor = groundOnly(sampler);
  group.add(frozenStream(floor, CASCADE, 1.2, 0.8));
  const ice = new GeoBuilder();
  // Ledges of rock jutting from the gully walls either side of the bridge, icicles hanging off them.
  [[-2.6, -224.5], [2.7, -226.5], [-2.5, -236], [2.6, -238.5]].forEach(([dx, z], i) => {
    const x = GX + dx, h = floor.heightAt(x, z);
    ice.add(GEO.ico, propMatrix(x, h + 0.3, z, 1.2, 0.7, 1.0, i), 'ROCK_DK', 'SNOW_LT', 0.5);
    icicles(ice, x - Math.sign(dx) * 0.7, h + 0.55, z, 6, i * 3);
  });
  group.add(ice.finish('cascade-icicles'));

  const rime = new GeoBuilder();
  for (const [x, z, k] of RIME) rimeRock(rime, x, z, y(x, z), k, x * 0.1);
  // The summit cairn: flat stones, each smaller, the top one capped with snow.
  const cy = y(CAIRN.x, CAIRN.z);
  [0.9, 0.75, 0.6, 0.45].forEach((r, i) => {
    rime.add(GEO.ico, propMatrix(CAIRN.x, cy + 0.2 + i * 0.38, CAIRN.z, r, 0.24, r * 0.9, i * 1.3), 'ROCK_MID', i === 3 ? 'SNOW_HI' : 'ROCK_SNOWCAP', 0.6);
  });
  const rimeMesh = rime.finish('rime-rocks');
  rimeMesh.userData.noCollide = true;
  group.add(rimeMesh);

  const colliders: Collider[] = [
    // The sledge, its stack of rounds and the chopping block, each its own box. One box over all three
    // walled off the gaps between them, and critic round 9 stood stuck against bare snow there.
    ...([[0, 0.07, 0.75, 1.75], [-2.6, 0, 0.95, 0.75], [2.1, 0.6, 0.45, 0.45]] as const).map(([lx, lz, hw, hd]): Collider => {
      const cos = Math.cos(SLEDGE.yaw), sin = Math.sin(SLEDGE.yaw);
      return { kind: 'box', x: SLEDGE.x + lx * cos + lz * sin, z: SLEDGE.z - lx * sin + lz * cos, hw, hd, yaw: SLEDGE.yaw };
    }),
    { kind: 'circle', x: ERRATIC.x, z: ERRATIC.z, r: 3.1 },
    { kind: 'box', x: BOTHY.x, z: BOTHY.z, hw: 2.3, hd: 1.8, yaw: Math.PI },
    // Its woodpile on the east wall and the bench by the door; the bothy is turned half round.
    { kind: 'box', x: BOTHY.x - 3.0, z: BOTHY.z + 0.3, hw: 0.6, hd: 0.8, yaw: Math.PI },
    { kind: 'box', x: BOTHY.x - 1.0, z: BOTHY.z - 2.25, hw: 0.85, hd: 0.3, yaw: Math.PI },
    ...RIME.map(([x, z, k]): Collider => ({ kind: 'circle', x, z, r: 1.1 * k })),
    { kind: 'circle', ...CAIRN, r: 0.8 },
  ];
  const occluders: Occluder[] = [
    { x: ERRATIC.x, z: ERRATIC.z, base: y(ERRATIC.x, ERRATIC.z), radius: 3, height: 5.2 },
    { x: BOTHY.x, z: BOTHY.z, base: y(BOTHY.x, BOTHY.z), radius: 2.6, height: 3.4 },
  ];
  return { group, colliders, occluders, clearings: [...SCENE_CLEARINGS] };
}
