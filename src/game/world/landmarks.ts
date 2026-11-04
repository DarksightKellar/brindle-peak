/**
 * Authored structures at fixed anchors.
 *
 * Content, quests, the scatter clearance test and the UI all reference LANDMARKS by id, so the
 * ids and coordinates below are a contract — not tuning knobs. Everything else here is
 * hand-dressed: a gable roof with a snow slab, lit windows routed into the unlit material bucket,
 * a truck with a snow cap, five houses around the hamlet square.
 *
 * Buildings are authored in local space and dropped at `heightAt(anchor)` with the base sunk
 * 0.8 units, so a sloping footprint never shows daylight under a wall.
 */
import * as THREE from 'three';
import type { PaletteKey } from '../../core/palette';
import type { TerrainSampler } from '../../core/contracts';
import { SPAWN } from '../../data/zones';
import { GEO, GeoBuilder, propMatrix } from './geoBuilder';
import { windowPools } from './windowLight';
import { house, type HouseLook } from './houses';
import { buildSummit } from './summit';
import { icedBoat } from './boat';
import type { Collider } from '../../core/player/collide';
import { BIRD_BULK } from './birdBulk';

/**
 * Gus's bell: a brass bell's profile turned round its axis, mouth down, about 0.9 tall. It was a small
 * lantern-coloured diamond, and from the throwing spot it read as a light on the post, not a bell.
 */
const BELL_SHAPE = new THREE.LatheGeometry(
  ([[0, 0.55], [0.1, 0.54], [0.19, 0.47], [0.23, 0.3], [0.26, 0.08], [0.33, -0.06], [0.42, -0.14], [0.42, -0.17], [0, -0.17]] as const)
    .map(([r, y]) => new THREE.Vector2(r, y)),
  8,
).toNonIndexed();

export const LANDMARKS: readonly { id: string; x: number; z: number }[] = [
  { id: 'station', x: -352, z: 352 },
  { id: 'trucknow', x: -300, z: 300 },
  { id: 'boathouse', x: 60, z: 300 },
  { id: 'hamlet', x: 250, z: 120 },
  { id: 'springs', x: -40, z: 60 },
  { id: 'mast', x: 330, z: -360 },
  { id: 'chimney', x: 243, z: -232 },
];

/** The valley trail, anchor to anchor. Dressing follows it, and so will the player. */
export const TRAIL: readonly (readonly [number, number])[] = [
  [-352, 352], [-300, 300], [-256, 232], [-230, 130], [-128, 96], [-40, 60], [86, 88], [250, 120],
  [232, 196], [150, 268], [60, 300], [96, 150], [150, -30], [240, -190], [300, -290], [330, -360],
];

/** Horizontal distance to the trail polyline. Used to dress the route more thickly than the wild. */
export function trailDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < TRAIL.length - 1; i++) {
    const [ax, az] = TRAIL[i];
    const [bx, bz] = TRAIL[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/** The five Kettle basins. landmark.ts builds the stone rims, water.ts fills them. */
export const SPRING_POOLS: readonly { x: number; z: number; r: number }[] = [
  { x: -40, z: 60, r: 3.4 },
  { x: -57, z: 76, r: 2.8 },
  { x: -24, z: 78, r: 3 },
  { x: -54, z: 44, r: 2.5 },
  { x: -20, z: 40, r: 2.3 },
];

/**
 * Ranger station: cabin, porch, mast and flag. Nana's, and "the blue house" on Pell's letter: painted
 * a deep blue with white corners and frames, the one house in the valley that is blue all over. Its
 * door is the grey-blue of paint the frost has had for years ("The door was blue, once").
 */
function station(b: GeoBuilder): void {
  house(b, 8.4, 6.2, 3.5, 'WATER_DEEP', 2, { trim: 'SNOW_HI', door: 'ROCK_LT', sideWindows: true });
  b.box(0, -0.35, 4.6, 7.6, 0.35, 2.6, 'WOOD_LT');
  b.cyl(-3.4, 0, 5.7, 0.12, 2.5, 'WOOD_DK');
  b.cyl(3.4, 0, 5.7, 0.12, 2.5, 'WOOD_DK');
  b.box(0, 2.4, 5.7, 7, 0.14, 0.14, 'WOOD_DK', 'SNOW_LT');
  b.cyl(5.6, -0.4, -2.2, 0.1, 8, 'ROCK_MID');
  b.glow();
  b.add(GEO.quad, propMatrix(6.05, 6.9, -2.2, 0.95, 0.55, 1), 'PIP_SCARF');
  b.glow(false);
  b.box(5.6, -0.4, -2.2, 0.7, 0.4, 0.7, 'ROCK_DK', 'SNOW_LT');
}

/** The parked truck: boxy body, cab, wheels, and the snow that fell on it. */
function truck(b: GeoBuilder): void {
  b.box(-0.4, 0.55, 0, 4.6, 1.0, 2.2, 'BRICK');
  b.box(2.1, 0.5, 0, 2.0, 1.35, 2.15, 'BRICK');
  b.box(-0.4, 1.55, 0, 4.7, 0.18, 2.3, 'SNOW_LT');
  b.box(2.1, 1.85, 0, 2.1, 0.16, 2.25, 'SNOW_HI');
  for (const [wx, wz] of [[-1.7, 1.1], [1.7, 1.1], [-1.7, -1.1], [1.7, -1.1]] as const) {
    b.box(wx, 0, wz, 0.7, 0.6, 0.36, 'ROCK_DK');
  }
  b.add(GEO.quad, propMatrix(3.11, 1.2, 0, 1.1, 0.6, 1), 'WOOD_DK');
}

/**
 * What the station stops, in its own frame: the cabin walls, the porch posts and the flag mast. The
 * porch deck is flush with the snow and walkable, and Nana stands just off it, so the cabin cannot be
 * boxed whole: its box took the porch and walled her off from the north-east.
 */
const STATION_SOLID: readonly { lx: number; lz: number; hw?: number; hd?: number; r?: number }[] = [
  { lx: 0, lz: 0, hw: 4.3, hd: 3.2 },
  { lx: -3.4, lz: 5.7, r: 0.12 + BIRD_BULK }, { lx: 3.4, lz: 5.7, r: 0.12 + BIRD_BULK },
  { lx: 5.6, lz: -2.2, r: 0.5 },
];

/** Shapes given in a mesh's own frame, placed where the mesh stands and turned the way it is turned. */
function placed(mesh: THREE.Object3D, parts: typeof STATION_SOLID): Collider[] {
  const c = Math.cos(mesh.rotation.y), s = Math.sin(mesh.rotation.y);
  return parts.map((p): Collider => {
    const x = mesh.position.x + p.lx * c + p.lz * s, z = mesh.position.z - p.lx * s + p.lz * c;
    return p.r !== undefined ? { kind: 'circle', x, z, r: p.r } : { kind: 'box', x, z, hw: p.hw ?? 0, hd: p.hd ?? 0, yaw: mesh.rotation.y };
  });
}

interface Building {
  dx: number;
  dz: number;
  w: number;
  d: number;
  h: number;
  wall: PaletteKey;
  windows: number;
  look?: HouseLook;
}

/**
 * Five fronts around a square. The other three of Pell's "four blue houses" are here: Orla's bakery
 * (the house she stands at) with its door painted bright blue in spring and flour on the step; a
 * door the frost has taken to grey-blue; and the green door Ivy sees as blue at dusk from the springs.
 */
const HAMLET: readonly Building[] = [
  { dx: -13, dz: -3, w: 5.2, d: 4.2, h: 2.7, wall: 'WOOD_LT', windows: 1, look: { door: 'SKY_LOW' } },
  { dx: 12, dz: -6, w: 4.2, d: 3.8, h: 2.5, wall: 'WOOD_MID', windows: 1 },
  { dx: 9, dz: 12, w: 3.8, d: 3.4, h: 2.3, wall: 'WOOD_DK', windows: 1, look: { door: 'PINE_HI' } },
  { dx: -10, dz: 12, w: 4.4, d: 3.6, h: 2.4, wall: 'WOOD_MID', windows: 1, look: { door: 'ICE_DEEP', trim: 'SNOW_LT', step: 'SNOW_HI' } },
  { dx: -1, dz: -14, w: 7, d: 5.2, h: 3.2, wall: 'WOOD_DK', windows: 2 },
];

function hamlet(sampler: TerrainSampler, x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'landmark:hamlet';
  for (const hb of HAMLET) {
    const b = new GeoBuilder();
    house(b, hb.w, hb.d, hb.h, hb.wall, hb.windows, hb.look);
    const mesh = b.finish('hamlet-house');
    mesh.position.set(x + hb.dx, sampler.heightAt(x + hb.dx, z + hb.dz), z + hb.dz);
    mesh.rotation.y = Math.atan2(-hb.dx, -hb.dz);
    group.add(mesh);
    group.add(windowPools(sampler, mesh, hb.w, hb.d, hb.windows));
  }
  // The square itself: a bell post, so the middle of the hamlet is not an empty lawn.
  const b = new GeoBuilder();
  b.cyl(0, -0.2, 0, 0.18, 3.4, 'WOOD_DK');
  b.box(0, 3.2, 0, 1.1, 0.16, 1.1, 'WOOD_DK', 'SNOW_LT');
  b.glow();
  // Hung from the crossbar, its middle at the throw target's height (activities/throwSetups.ts BELL).
  b.add(BELL_SHAPE, propMatrix(0, 2.5, 0, 1.3, 1.3, 1.3), 'AMBER');
  b.glow(false);
  const bell = b.finish('hamlet-bell');
  bell.position.set(x, sampler.heightAt(x, z), z);
  bell.userData.colliders = [{ kind: 'circle', x, z, r: 0.18 + BIRD_BULK }];
  group.add(bell);
  return group;
}

/** Stone rims for the five basins; the water itself is water.ts. */
function springs(sampler: TerrainSampler): THREE.Group {
  const group = new THREE.Group();
  group.name = 'landmark:springs';
  for (const pool of SPRING_POOLS) {
    const y = sampler.heightAt(pool.x, pool.z);
    const b = new GeoBuilder();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rx = Math.cos(a) * (pool.r + 0.5);
      const rz = Math.sin(a) * (pool.r + 0.5);
      const dy = sampler.heightAt(pool.x + rx, pool.z + rz) - y;
      b.add(GEO.ico, propMatrix(rx, dy + 0.14, rz, 0.62, 0.4, 0.55, a), 'ROCK_WARM', 'ROCK_SNOWCAP', 0.5);
    }
    const mesh = b.finish('spring-basin');
    mesh.position.set(pool.x, y, pool.z);
    group.add(mesh);
  }
  return group;
}

/** Two boulders and a climbing rope at the foot of Nettle Chimney. */
function chimneyMarker(b: GeoBuilder): void {
  b.add(GEO.ico, propMatrix(-1.5, 0.55, 0.4, 1.15, 0.9, 1, 0.3), 'ROCK_DK', 'ROCK_SNOWCAP', 0.5);
  b.add(GEO.ico, propMatrix(1.6, 0.4, -0.5, 0.9, 0.68, 0.84, 1.1), 'ROCK_MID', 'ROCK_SNOWCAP', 0.5);
  b.strut([-1.5, 1.1, 0.4], [0.2, 0.5, 0.1], 0.055, 'BRUSH');
  b.strut([0.2, 0.5, 0.1], [1.6, 0.95, -0.5], 0.055, 'BRUSH');
  b.strut([0.2, 0.5, 0.1], [0.1, -0.1, -0.7], 0.045, 'BRUSH');
}

export function buildLandmarks(sampler: TerrainSampler): THREE.Group {
  const root = new THREE.Group();
  root.name = 'landmarks';
  for (const lm of LANDMARKS) {
    if (lm.id === 'hamlet') {
      root.add(hamlet(sampler, lm.x, lm.z));
      continue;
    }
    if (lm.id === 'springs') {
      root.add(springs(sampler));
      continue;
    }
    if (lm.id === 'mast') {
      // The mast and Edda's hut (summit.ts) carry their own colliders; guy wires are not walls.
      const summit = buildSummit(sampler, lm.x, lm.z);
      summit.group.userData.colliders = summit.colliders;
      root.add(summit.group);
      continue;
    }
    const b = new GeoBuilder();
    switch (lm.id) {
      case 'station':
        station(b);
        break;
      case 'trucknow':
        truck(b);
        break;
      case 'boathouse':
        icedBoat(b);
        break;
      case 'chimney':
        chimneyMarker(b);
        break;
      default:
        break;
    }
    const mesh = b.finish(lm.id);
    mesh.position.set(lm.x, sampler.heightAt(lm.x, lm.z), lm.z);
    // Fronts face the valley centre — except the station, which faces the arrival point.
    mesh.rotation.y = lm.id === 'station' ? Math.atan2(SPAWN.x - lm.x, SPAWN.z - lm.z) : Math.atan2(-lm.x, -lm.z);
    mesh.name = `landmark:${lm.id}`;
    if (lm.id === 'station') {
      mesh.userData.noCollide = true;
      mesh.userData.colliders = placed(mesh, STATION_SOLID);
    }
    root.add(mesh);
  }
  return root;
}
