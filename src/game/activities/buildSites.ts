/**
 * Where each build happens and what it turns into, one press at a time.
 *
 * A build used to be "press E three times standing still" with nothing appearing in the world, and
 * one of them (Bram's woodpile) sits on the main story path. Each site below is a real spot near its
 * activity post, and each press adds one visible step: a log onto the pile, a ball onto the snowman,
 * a stone into the dam. Steps are lists so the last press can finish a thing off (the snowman's face,
 * the capstones of the dam) rather than ending on an anticlimax.
 *
 * Layouts are authored in the site's local frame: +Z is the side the player sees (towards the post),
 * +X runs across. `facing` turns that frame in the world. Heights are above the ground at the site.
 */

import type { ActivityDef, TerrainSampler, Vec2 } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import type { PieceLook, PlacedMarker } from './markerLooks';
import { LOG } from './pieceMeshes';
import { fishSpotMarkers } from './fishSpots';
import { photoSubjectMarkers } from './photoSubjects';
import { startPropMarkers } from './startProps';

export type BuildKind = 'woodpile' | 'snowman' | 'dam';

export interface BuildSite {
  kind: BuildKind;
  at: Vec2;
  /** World yaw of the layout's +Z (its front). */
  facing: number;
  /** Where Pip stands to build, and the point they face, in the layout's frame; omitted: where they are. */
  stand?: { x: number; z: number; lookX: number; lookZ: number };
}

export interface Piece {
  look: PieceLook;
  x: number;
  y: number;
  z: number;
  yaw?: number;
  tilt?: number;
  size?: number;
}

const toward = (from: Vec2, to: Vec2): number => Math.atan2(to.x - from.x, to.z - from.z);

/** Pool at Kettle Springs the dam closes (landmarks.ts SPRING_POOLS[3]); the wall hugs its rim. */
const DAM_POOL = { x: -54, z: 44 };
const DAM_DIR = Math.atan2(1, 1);
const DAM_RADIUS = 4.3;
const DAM_AT = { x: DAM_POOL.x + Math.sin(DAM_DIR) * DAM_RADIUS, z: DAM_POOL.z + Math.cos(DAM_DIR) * DAM_RADIUS };

/**
 * Bram's woodstore (world/namedPlaces.ts WOODSTORE, turned -0.15, 4.4 u wide, open to +z). Not imported:
 * that module builds meshes. "The end of the pile's come down in a heap": the crib is the end of the
 * store rebuilt, standing against its east wall, with the heap spilled beyond it.
 */
const STORE = { x: -339.5, z: 295.5, yaw: -0.15 };
const storeLocal = (x: number, z: number): Vec2 => ({
  x: STORE.x + x * Math.cos(STORE.yaw) + z * Math.sin(STORE.yaw),
  z: STORE.z - x * Math.sin(STORE.yaw) + z * Math.cos(STORE.yaw),
});

export const BUILD_SITES: Readonly<Record<string, BuildSite>> = {
  // The pile is the activity post itself (data/activities.ts), so the prompt floats over the logs. Its
  // front is the store's open front, toward Bram and the cabin, the way the player arrives.
  // Pip stands off the open end, facing the crib with the heap at their feet.
  'hearth-kindling': {
    kind: 'woodpile', at: storeLocal(4.1, 0.3), facing: STORE.yaw, stand: { x: 1.9, z: -0.4, lookX: -0.9, lookZ: -0.1 },
  },
  'hamlet-snowman': { kind: 'snowman', at: { x: 212.6, z: 136.6 }, facing: toward({ x: 212.6, z: 136.6 }, { x: 214, z: 138 }) },
  'kettles-dam-build': { kind: 'dam', at: DAM_AT, facing: DAM_DIR },
};

const NOUN: Readonly<Record<BuildKind, string>> = { woodpile: 'Logs', snowman: 'Snowman, part', dam: 'Dam, part' };

const R = LOG.radius;
/**
 * A crib: four layers of two logs, each layer square across the one below. A row of parallel logs
 * read as one brown box from the side at 384 x 216; crossing them shows both bark and cut ends from
 * any angle, and a crib is what a woodpile stacked straight looks like. One log per step: each is laid
 * square on its own (logSwing.ts).
 */
const CRIB_X = -0.9; // the crib stands left of the heap it is built from
const WOODPILE: readonly Piece[][] = [0, 1, 2, 3].map((k) => {
  const along = k % 2 === 0; // even layers run along local X, odd ones along Z
  const y = k * R * 1.84; // each layer sits in the notch of the one below
  const off = 0.58;
  return [-1, 1].map((side) => ({
    look: 'log' as const,
    x: CRIB_X + (along ? 0.02 * k * side : side * off),
    y,
    z: along ? side * off : -0.02 * k * side,
    yaw: along ? 0 : Math.PI / 2,
  }));
}).flat().map((log) => [log]);

/**
 * Bram's complaint, standing there before anyone touches it: the same eight logs dumped in a crooked
 * heap, tipped and crossed, spilled out in front of the crib. Each log laid square comes off the top
 * of it, so the heap shrinks as the crib grows and the finished pile is the only pile. Listed top
 * first, authored as if spilled to the right and turned to lie in front (`spilled` below), so the
 * camera at the open end sees the crib beside it rather than through it.
 */
const spilled = (p: Piece): Piece => ({ ...p, x: CRIB_X + p.z, z: 0.45 + p.x, yaw: (p.yaw ?? 0) + Math.PI / 2 });
const HEAP: readonly Piece[] = ([
  { look: 'log', x: 1.1, y: 0.72, z: 0.2, yaw: 1.6, tilt: -0.35 },
  { look: 'log', x: 1.3, y: 0.4, z: 0.0, yaw: 1.1, tilt: 0.25 },
  { look: 'log', x: 1.5, y: 0.38, z: -0.7, yaw: 2.2, tilt: 0.3 },
  { look: 'log', x: 1.9, y: 0.08, z: 0.7, yaw: 2.5, tilt: -0.15 },
  { look: 'log', x: 1.0, y: 0, z: 0.35, yaw: 1.3 },
  { look: 'log', x: 1.65, y: 0, z: -0.2, yaw: 1.9 },
  { look: 'log', x: 0.75, y: 0.04, z: -0.65, yaw: 0.4, tilt: 0.1 },
  { look: 'log', x: 2.15, y: 0, z: -0.95, yaw: 0.9 },
] satisfies Piece[]).map(spilled);

/**
 * The ground Bram's woodpile covers, crib and heap together, as a box collider: the heap stands there
 * before the build and the crib after, so it is solid either way. Pip's stand spot is outside it.
 */
export function woodpileFootprint(): Extract<Collider, { kind: 'box' }> | null {
  const site = Object.values(BUILD_SITES).find((s) => s.kind === 'woodpile');
  if (!site) return null;
  const lx = -1.0, lz = 0.9; // the middle of local x -1.9..-0.1, z -0.9..2.7
  const c = Math.cos(site.facing), s = Math.sin(site.facing);
  return { kind: 'box', x: site.at.x + lx * c + lz * s, z: site.at.z - lx * s + lz * c, hw: 0.9, hd: 1.8, yaw: site.facing, top: 1.9 };
}

/** What stands at a site before the build: the crooked heap for the woodpile, nothing elsewhere. */
export function heapLeft(site: BuildSite, placedSteps: number): readonly Piece[] {
  if (site.kind !== 'woodpile') return [];
  const taken = WOODPILE.slice(0, placedSteps).reduce((n, step) => n + step.length, 0);
  return HEAP.slice(Math.min(HEAP.length, taken));
}

/** Base, middle, head, then a face, two twig arms, a scarf and a hat on the last press. */
const SNOWMAN: readonly Piece[][] = [
  [{ look: 'snowball', x: 0, y: -0.03, z: 0, size: 0.62 }],
  [{ look: 'snowball', x: 0, y: 1.0, z: 0, size: 0.46, yaw: 0.6 }],
  [{ look: 'snowball', x: 0.02, y: 1.78, z: 0, size: 0.33, yaw: 1.3 }],
  [
    { look: 'carrot', x: 0.02, y: 2.07, z: 0.28 },
    { look: 'coal', x: -0.09, y: 2.17, z: 0.27 },
    { look: 'coal', x: 0.13, y: 2.16, z: 0.26 },
    { look: 'twig', x: 0.36, y: 1.5, z: 0, yaw: 0.15, tilt: 0.45 },
    { look: 'twig', x: -0.36, y: 1.5, z: 0, yaw: Math.PI - 0.1, tilt: 0.3 },
    { look: 'scarf', x: 0, y: 1.84, z: 0 },
    { look: 'hat', x: 0.02, y: 2.33, z: 0, yaw: 0.2 },
  ],
];

/**
 * A two-course stone wall just outside the pool's own rim stones, built left to right: each press
 * sets a footing stone, and from the second press on a smaller stone bridges the joint behind it.
 * Kept a clear metre outside the rim (landmarks.ts rings each basin at r + 0.5) so the new wall
 * reads as something built, not as more of the rim.
 */
const DAM: readonly Piece[][] = (() => {
  const xs = [-1.5, -0.75, 0, 0.75, 1.5];
  const sizes = [0.78, 0.86, 0.9, 0.84, 0.76];
  const rim = (x: number): number => -(x * x) / (2 * DAM_RADIUS); // follow the pool's curve
  return xs.map((x, i) => {
    const step: Piece[] = [{ look: 'stone', x, y: -0.08, z: rim(x), size: sizes[i], yaw: i * 1.3 }];
    if (i > 0) {
      const mid = (x + xs[i - 1]) / 2;
      step.push({ look: 'stone', x: mid, y: 0.42, z: rim(mid) - 0.05, size: 0.55, yaw: i * 2.1 });
    }
    return step;
  });
})();

const LAYOUTS: Readonly<Record<BuildKind, readonly Piece[][]>> = { woodpile: WOODPILE, snowman: SNOWMAN, dam: DAM };

/** A site for any build, authored or not: unknown ids get a snowman just beside the post. */
export function siteFor(def: ActivityDef): BuildSite {
  const site = BUILD_SITES[def.id];
  if (site) return site;
  const at = { x: def.pos.x + 1.6, z: def.pos.z };
  return { kind: 'snowman', at, facing: toward(at, def.pos) };
}

export function stepsFor(site: BuildSite): readonly Piece[][] {
  return LAYOUTS[site.kind];
}

export function nounFor(site: BuildSite): string {
  return NOUN[site.kind];
}

/** A local piece placed in the world, `drop` metres above its resting point. */
export function placePiece(site: BuildSite, ground: number, p: Piece, key: string, drop = 0, wobble = 0): PlacedMarker {
  const c = Math.cos(site.facing);
  const s = Math.sin(site.facing);
  return {
    shape: 'lump',
    look: p.look,
    keep: key,
    x: site.at.x + p.x * c + p.z * s,
    y: ground + p.y + drop,
    z: site.at.z - p.x * s + p.z * c,
    yaw: site.facing + (p.yaw ?? 0) + wobble,
    tilt: p.tilt,
    size: p.size,
  };
}

/**
 * Every build site as it stands, for the marker layer's `restore()` at boot: a completed build (its
 * `activity:<id>` counter is set) stands finished; an untouched one shows what it was before, which
 * for Bram's woodpile is the crooked heap he complains about.
 *
 * The name is older than the heap; the session calls it once at boot for everything that stands.
 */
export function finishedBuildMarkers(
  defs: readonly ActivityDef[],
  counters: Readonly<Record<string, number>>,
  terrain: TerrainSampler,
): PlacedMarker[] {
  const out: PlacedMarker[] = [];
  for (const def of defs) {
    if (def.kind !== 'build') continue;
    const site = siteFor(def);
    const ground = terrain.heightAt(site.at.x, site.at.z);
    const done = (counters[`activity:${def.id}`] ?? 0) > 0;
    const pieces = done ? stepsFor(site).flat() : heapLeft(site, 0);
    for (const p of pieces) out.push(placePiece(site, ground, p, def.id));
  }
  // And what other activities leave standing for good: the pools and the ice hole to fish, the deer,
  // and the prop at every start that says something is done here.
  return out.concat(fishSpotMarkers(terrain), photoSubjectMarkers(terrain), startPropMarkers(defs, terrain));
}
