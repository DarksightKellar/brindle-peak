/**
 * Places the words name: where they stand, what is cleared around them, and what they block.
 *
 * Every place the dialogue or a quest step sends the player to must be something you can see when
 * you get there. The big pine by Bram's woodstore, the split pine by the creek, the creek itself and
 * Nana's lantern posts were all words without a referent. They are placed here, and the scatter is
 * cleared off them afterwards (`clearOfNamedPlaces`), so adding them moves no other tree in the
 * valley: race courses and camera spots validated against the scatter stay valid.
 *
 * Positions follow where the game points. The big pine stands just behind Bram, south of the cabin,
 * where "Ask Bram by the big pine" leads. The split pine stands 12 u from the Pinewind centre the
 * mitten errand's compass points at, and the creek rises under its roots and runs past the Creek
 * Pool fishing spot and Fen's perch ("the pines, creek side").
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import type { Occluder } from '../camera/occlusion';
import { PICKUPS } from '../../data/pickups';
import { BIG_PINE_HEIGHT, bigPine, SPLIT_PINE_HEIGHT, splitPine, woodstore } from './bigTrees';
import { buildCreek, creekDistance } from './creek';
import { GeoBuilder } from './geoBuilder';
import { RADIO_HUT } from './summit';
import { buildTrail, type Detour, WAY_UP, wayDistance } from './trail';
import { LANDMARKS } from './landmarks';
import { ACTIVITIES } from '../../data/activities';
import { RACE_COURSES } from '../activities/raceCourses';
import { buildWayScenes, SCENE_CLEARINGS } from './wayScenes';
import { buildKettlesDressing } from './kettlesDressing';
import { buildHoarfrostGlade, GLADE } from './hoarfrostGlade';
import { buildTuckBridge } from './tuckBridge';
import { GULLY_LINE, GULLY_RIM, TUCK_BRIDGE } from '../../core/terrain/carving';
import { NPCS } from '../../data/npcs';
import { SPAWN, WORLD_SEED } from '../../data/zones';

export const BIG_PINE = { x: -347, z: 300 } as const;
export const SPLIT_PINE = { x: -226, z: 118 } as const;
/** Bram's woodstore, under the big pine, open side to the cabin. */
export const WOODSTORE = { x: -339.5, z: 295.5 } as const;

const LANTERN_POSTS = PICKUPS.filter((p) => p.kind === 'lantern');

/** Discs the scatter must leave empty, beyond the landmark clearances it already keeps. */
const CLEARINGS: readonly { x: number; z: number; r: number }[] = [
  { ...BIG_PINE, r: 7.5 },
  { ...SPLIT_PINE, r: 6.5 },
  { ...WOODSTORE, r: 4.5 },
  { x: RADIO_HUT.x, z: RADIO_HUT.z, r: 5 },
  ...LANTERN_POSTS.map((p) => ({ x: p.pos.x, z: p.pos.z, r: 2.4 })),
  ...SCENE_CLEARINGS,
  GLADE,
  // Tuck's bridge heads, and a step of room round every villager so no trunk grows through one.
  { x: TUCK_BRIDGE.ax - 1.5, z: TUCK_BRIDGE.az, r: 4.5 }, { x: TUCK_BRIDGE.bx + 1.5, z: TUCK_BRIDGE.bz, r: 4.5 },
  ...NPCS.map((n) => ({ x: n.pos.x, z: n.pos.z, r: 2.6 })),
  // The fresh start and the walk to Nana's door: critic round 65 opened on a pine a step from Pip, its
  // crown filling the frame, and wedged Pip against its trunk within a couple of keys.
  { x: SPAWN.x, z: SPAWN.z, r: 5.5 },
  ...[0.33, 0.66].map((t) => {
    const nana = NPCS.find((n) => n.id === 'nana')?.pos ?? SPAWN;
    return { x: SPAWN.x + (nana.x - SPAWN.x) * t, z: SPAWN.z + (nana.z - SPAWN.z) * t, r: 4 };
  }),
  // Room round every activity, wider for throws (their targets stand out ahead), and a lane down each
  // race: critic round 64 saw a pine crown fill the pinecone toss and lost Pip among the deer run's trunks.
  ...ACTIVITIES.map((a) => ({ x: a.pos.x, z: a.pos.z, r: a.radius + (a.kind === 'throw' ? 9 : 4) })),
  ...Object.entries(RACE_COURSES).flatMap(([id, c]) => {
    const start = ACTIVITIES.find((a) => a.id === id)?.pos;
    const pts = start ? [start, ...c.gates] : [...c.gates];
    return pts.flatMap((p, i) => {
      const q = pts[i + 1];
      // Eight round a gate and six either side of the lane: the chase camera trails wide on a turn, and
      // critic round 65 still saw the deer run's last gate through pines 7.8 and 9.5 u off it.
      const lane = [{ x: p.x, z: p.z, r: 8 }];
      if (q) for (const t of [0.2, 0.4, 0.6, 0.8]) lane.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, r: 6 });
      return lane;
    });
  }),
];

/** Inside the gully or on its lip: the walls are bare, the floor holds only the frozen stream. */
function inGully(x: number, z: number): boolean {
  const [[gx, az], [, bz]] = GULLY_LINE; // it runs due south
  return Math.abs(x - gx) < GULLY_RIM + 1.5 && z <= Math.max(az, bz) + 2 && z >= Math.min(az, bz) - 2;
}

/**
 * How wide the way up is kept clear, either side. Through Pinewind it is a ride cut through the pines,
 * wide enough that from the trailhead the summit stands at the end of it; beyond, a walking width.
 */
const RIDE_END = WAY_UP[3];
function wayClearance(x: number, z: number): number {
  return x < RIDE_END[0] + 8 && z > RIDE_END[1] - 8 ? 8.5 : 4;
}

/** False where a scattered prop would stand inside a named place, on the creek, its banks or the trail. */
export function clearOfNamedPlaces(x: number, z: number): boolean {
  for (const c of CLEARINGS) if (Math.hypot(x - c.x, z - c.z) < c.r) return false;
  if (inGully(x, z)) return false;
  return creekDistance(x, z) > 2.6 && wayDistance(x, z) > wayClearance(x, z);
}

export interface NamedPlaces {
  group: THREE.Group;
  colliders: Collider[];
  occluders: Occluder[];
}

function stand(sampler: TerrainSampler, b: GeoBuilder, name: string, x: number, z: number, yaw: number): THREE.Mesh {
  const mesh = b.finish(name);
  mesh.position.set(x, sampler.heightAt(x, z), z);
  mesh.rotation.y = yaw;
  return mesh;
}

export function buildNamedPlaces(sampler: TerrainSampler): NamedPlaces {
  const group = new THREE.Group();
  group.name = 'named-places';

  const big = new GeoBuilder();
  bigPine(big);
  group.add(stand(sampler, big, 'big-pine', BIG_PINE.x, BIG_PINE.z, 0.3));

  const split = new GeoBuilder();
  splitPine(split);
  // Unturned: the arched roots are on the -x side, where the creek rises.
  group.add(stand(sampler, split, 'split-pine', SPLIT_PINE.x, SPLIT_PINE.z, 0));

  const store = new GeoBuilder();
  woodstore(store);
  // Open side toward the cabin and Bram (+z, north of it).
  group.add(stand(sampler, store, 'woodstore', WOODSTORE.x, WOODSTORE.z, -0.15));

  group.add(buildCreek(sampler));
  const hamlet = LANDMARKS.find((l) => l.id === 'hamlet');
  const detours: Detour[] = [
    ...(hamlet ? [{ x: hamlet.x, z: hamlet.z, kind: 'hamlet' as const }] : []),
    ...ACTIVITIES.map((a) => ({ x: a.pos.x, z: a.pos.z, kind: 'activity' as const })),
  ];
  const trail = buildTrail(sampler, LANTERN_POSTS.map((p) => p.pos), detours);
  const scenes = buildWayScenes(sampler);
  const kettles = buildKettlesDressing(sampler, WORLD_SEED);
  const glade = buildHoarfrostGlade(sampler);
  const bridge = buildTuckBridge(sampler);
  group.add(trail.group, scenes.group, kettles.group, glade.group, bridge.group);

  const colliders: Collider[] = [
    { kind: 'circle', x: BIG_PINE.x, z: BIG_PINE.z, r: 1.5 },
    { kind: 'circle', x: SPLIT_PINE.x, z: SPLIT_PINE.z, r: 1.3 },
    { kind: 'box', x: WOODSTORE.x, z: WOODSTORE.z, hw: 2.3, hd: 1.2, yaw: -0.15 },
    // The chopping block in front of it (bigTrees.ts, local (1.6, 1.8) under the -0.15 turn).
    { kind: 'circle', x: WOODSTORE.x + 1.6 * Math.cos(-0.15) + 1.8 * Math.sin(-0.15), z: WOODSTORE.z - 1.6 * Math.sin(-0.15) + 1.8 * Math.cos(-0.15), r: 0.5 },
    ...trail.colliders,
    ...scenes.colliders,
    ...kettles.colliders,
    ...glade.colliders,
    ...bridge.colliders,
  ];
  const occluders: Occluder[] = [
    { x: BIG_PINE.x, z: BIG_PINE.z, base: sampler.heightAt(BIG_PINE.x, BIG_PINE.z), radius: 4.5, height: BIG_PINE_HEIGHT },
    { x: SPLIT_PINE.x, z: SPLIT_PINE.z, base: sampler.heightAt(SPLIT_PINE.x, SPLIT_PINE.z), radius: 3, height: SPLIT_PINE_HEIGHT },
    ...scenes.occluders,
  ];
  return { group, colliders, occluders };
}
