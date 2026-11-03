/**
 * The way up: the trail from Nana's door to the mast, and the marks that make it read as one.
 *
 * The goal points straight at Edda, so the player walks the straight line from the cabin toward the
 * peak. Nana's lantern posts used to follow an older route that wandered 50-140 u off that line, so a
 * player walking toward the goal passed none of them ("the lantern posts mark the way up", and there
 * were none). WAY_UP is the line the goal actually leads you along, as far as it can be walked:
 *
 *  - From the cabin it runs dead straight at the peak through Pinewind Wood. The scatter is cleared
 *    off it (namedPlaces.ts), so it is a ride cut through the pines, and from the trailhead the
 *    summit stands at the end of it.
 *  - It crosses the Kettle Springs basin along the south edge of the pools, and the open snow beyond
 *    to the foot of Windscar Ridge.
 *  - There the straight line meets the north face, too steep to walk. The trail turns west along the
 *    foot, climbs the one walkable spur near x = 70 (the same spur the Lantern Ascent race uses),
 *    runs east along the shelf behind the crest to the saddle by Nettle Chimney, and goes straight up
 *    the summit slope to the mast. Every leg was walked at the controller's 0.35 slope limit.
 *
 * Between Nana's posts (pickups.ts, placed on this line) short marker stakes with a red-painted top
 * stand every ~24 u on the uphill-left side, so the trail reads as a line you can follow from post to
 * post; on the steep spur they carry a rope. Red is the mast's paint: the marks and the goal match.
 */

import * as THREE from 'three';
import type { TerrainSampler, Vec2 } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import { GEO, GeoBuilder, propMatrix } from './geoBuilder';
import { gullyDepth, TUCK_BRIDGE } from '../../core/terrain/carving';
import { BIRD_BULK } from './birdBulk';

export const WAY_UP: readonly (readonly [number, number])[] = [
  [-352, 336], [-262.4, 244.6], [-173.5, 153.9], [-100, 79], [-30, 36], [60, -57], [150, -150],
  [110, -159], [94, -166], [80, -180], [66, -194], [66, -214], [78, -230], [140, -231], [198, -231],
  [216, -238], [258, -280], [300, -320], [330, -340],
];

/** Index of the vertex where the trail leaves the straight line and turns west along the ridge foot. */
export const TURN = 6;
/** The spur, as a range of legs: there a closer row of short stakes carries a rope. */
const SPUR = [8, 12] as const;
const STAKE_EVERY = 24;
/** Stakes keep this far from a lantern post, so a post is never crowded by its own markers. */
const POST_GAP = 9;
const SIDE = 2.2;

/** Horizontal distance from (x, z) to the trail. */
export function wayDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < WAY_UP.length - 1; i++) {
    const [ax, az] = WAY_UP[i];
    const [bx, bz] = WAY_UP[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

export interface WayPoint {
  x: number;
  z: number;
  /** Unit direction of travel, up the trail. */
  dx: number;
  dz: number;
  /** Distance walked from the cabin. */
  s: number;
  /** Which leg of WAY_UP it lies on. */
  leg: number;
}

/** Points every `step` u along the trail, with their direction of travel. */
export function wayPoints(step: number): WayPoint[] {
  const out: WayPoint[] = [];
  let s = 0;
  let next = 0;
  for (let i = 0; i < WAY_UP.length - 1; i++) {
    const [ax, az] = WAY_UP[i];
    const [bx, bz] = WAY_UP[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    while (next <= s + len) {
      const t = next - s;
      out.push({ x: ax + dx * t, z: az + dz * t, dx, dz, s: next, leg: i });
      next += step;
    }
    s += len;
  }
  return out;
}

/** A marker stake: timber, a band of red paint that holds its colour, a cap of snow. */
function stake(b: GeoBuilder, x: number, y: number, z: number): void {
  b.cyl(x, y - 0.3, z, 0.1, 1.75, 'WOOD_MID');
  b.glow();
  b.cyl(x, y + 1.1, z, 0.115, 0.32, 'PIP_SCARF');
  b.glow(false);
  b.box(x, y + 1.44, z, 0.24, 0.1, 0.24, 'SNOW_LT', 'SNOW_HI');
}

/** Trailhead and turning signposts: a post and two boards, one pointing on up the trail. */
function signpost(b: GeoBuilder, x: number, y: number, z: number, upX: number, upZ: number, backX: number, backZ: number): void {
  b.cyl(x, y - 0.3, z, 0.13, 2.6, 'WOOD_MID');
  b.box(x, y + 2.3, z, 0.3, 0.12, 0.3, 'SNOW_LT', 'SNOW_HI');
  // Each board reaches 0.95 u from the post toward its bearing; the up board wears the red band.
  for (const [ux, uz, h, red] of [[upX, upZ, 1.85, true], [backX, backZ, 1.45, false]] as const) {
    const len = Math.hypot(ux, uz) || 1;
    const ex = x + (ux / len) * 0.95, ez = z + (uz / len) * 0.95;
    b.strut([x, y + h, z], [ex, y + h, ez], 0.16, 'WOOD_LT');
    if (red) {
      b.glow();
      b.strut([x + (ux / len) * 0.7, y + h, z + (uz / len) * 0.7], [ex, y + h, ez], 0.17, 'PIP_SCARF');
      b.glow(false);
    }
  }
}

/**
 * Where the way up passes something worth a detour: the hamlet, and every activity standing off the
 * line. Critic round 4 followed the compass to the peak and only learned from the map afterwards that
 * it had walked straight past Hollowpine Hamlet and most of the activities. Each detour gets an arm on
 * a signpost at the nearest point of the trail, turned toward it; an activity's arm carries the same
 * pale globe its own pennant wears, so the sign and the place match. The story's route is unchanged.
 */
export interface Detour {
  x: number;
  z: number;
  kind: 'hamlet' | 'activity';
}

/** Detours farther than this from the trail get no sign; nearer than OFF_ROUTE need none. */
const DETOUR_MAX = 130;
const OFF_ROUTE = 22;
/** Detours whose junctions fall within this much trail of each other share one post. */
const JUNCTION_BIN = 48;
const ARMS_MAX = 3;

/** The nearest point of the trail to (x, z), with its direction of travel and distance along. */
function nearestOnWay(x: number, z: number): WayPoint & { off: number } {
  let best: (WayPoint & { off: number }) | null = null;
  let s0 = 0;
  for (let i = 0; i < WAY_UP.length - 1; i++) {
    const [ax, az] = WAY_UP[i];
    const [bx, bz] = WAY_UP[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const t = Math.max(0, Math.min(len, (x - ax) * dx + (z - az) * dz));
    const px = ax + dx * t, pz = az + dz * t;
    const off = Math.hypot(x - px, z - pz);
    if (!best || off < best.off) best = { x: px, z: pz, dx, dz, s: s0 + t, leg: i, off };
    s0 += len;
  }
  return best as WayPoint & { off: number };
}

/** One post per junction, its arms pointing at the detours that branch off there, nearest first. */
function detourSigns(b: GeoBuilder, sampler: TerrainSampler, detours: readonly Detour[], posts: readonly Vec2[], colliders: Collider[]): void {
  const bins = new Map<number, { at: WayPoint; to: (Detour & { off: number })[] }>();
  for (const d of detours) {
    const at = nearestOnWay(d.x, d.z);
    if (at.off < OFF_ROUTE || (d.kind === 'activity' && at.off > DETOUR_MAX)) continue;
    const key = Math.round(at.s / JUNCTION_BIN);
    const bin = bins.get(key) ?? { at, to: [] };
    bin.to.push({ ...d, off: at.off });
    bins.set(key, bin);
  }
  for (const { at, to } of bins.values()) {
    // Right of the direction of travel, across the trail from the red stakes.
    let x = at.x - at.dz * 3, z = at.z + at.dx * 3;
    const crowded = posts.some((q) => Math.hypot(q.x - x, q.z - z) < POST_GAP);
    if (crowded) { x += at.dx * 6; z += at.dz * 6; }
    if (gullyDepth(x, z) > 0 || Math.hypot(x - (TUCK_BRIDGE.ax + TUCK_BRIDGE.bx) / 2, z - TUCK_BRIDGE.az) < 12) continue;
    const y = sampler.heightAt(x, z);
    b.cyl(x, y - 0.3, z, 0.13, 2.7, 'WOOD_MID');
    b.box(x, y + 2.4, z, 0.3, 0.12, 0.3, 'SNOW_LT', 'SNOW_HI');
    to.sort((p, q) => (p.kind === 'hamlet' ? -1 : q.kind === 'hamlet' ? 1 : p.off - q.off));
    to.slice(0, ARMS_MAX).forEach((d, i) => {
      const len = Math.hypot(d.x - x, d.z - z) || 1;
      const ux = (d.x - x) / len, uz = (d.z - z) / len;
      const h = 2.05 - i * 0.38;
      const ex = x + ux * 1.05, ez = z + uz * 1.05;
      b.strut([x, y + h, z], [ex, y + h, ez], 0.15, 'WOOD_LT');
      b.glow();
      if (d.kind === 'hamlet') b.strut([x + ux * 0.65, y + h, z + uz * 0.65], [ex, y + h, ez], 0.16, 'LANTERN');
      else b.add(GEO.ico, propMatrix(ex + ux * 0.1, y + h, ez + uz * 0.1, 0.15, 0.15, 0.15), 'SUN_HI');
      b.glow(false);
    });
    colliders.push({ kind: 'circle', x, z, r: 0.12 + BIRD_BULK });
  }
}

export interface Trail {
  group: THREE.Group;
  colliders: Collider[];
}

/** The stakes and signposts along WAY_UP. `posts` are Nana's lantern posts, already on the line. */
export function buildTrail(sampler: TerrainSampler, posts: readonly Vec2[], detours: readonly Detour[] = []): Trail {
  const b = new GeoBuilder();
  const colliders: Collider[] = [];
  for (const p of wayPoints(STAKE_EVERY)) {
    if (p.s < 6) continue;
    if (posts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < POST_GAP)) continue;
    // Uphill-left of the direction of travel: (dz, -dx) turned the other way is left in this frame.
    const x = p.x + p.dz * SIDE, z = p.z - p.dx * SIDE;
    // Tuck's bridge carries the way over the gully; its posts are the marks there.
    if (gullyDepth(x, z) > 0 || Math.hypot(x - (TUCK_BRIDGE.ax + TUCK_BRIDGE.bx) / 2, z - TUCK_BRIDGE.az) < 12) continue;
    const y = sampler.heightAt(x, z);
    stake(b, x, y, z);
    colliders.push({ kind: 'circle', x, z, r: 0.1 + BIRD_BULK });
  }
  // On the spur the stakes stand closer and carry a rope: the steep bit, held on to.
  const spur = wayPoints(6).filter((p) => p.leg >= SPUR[0] && p.leg < SPUR[1]);
  let last: [number, number, number] | null = null;
  for (const p of spur) {
    const x = p.x + p.dz * SIDE, z = p.z - p.dx * SIDE;
    const y = sampler.heightAt(x, z);
    b.cyl(x, y - 0.3, z, 0.08, 1.4, 'WOOD_DK');
    if (last) b.strut([last[0], last[1] + 0.95, last[2]], [x, y + 0.95, z], 0.035, 'BRUSH');
    last = [x, y, z];
  }

  // The trailhead, at the cabin end of the ride; and the turn at the ridge foot, where the straight
  // line ends and the trail goes west. Each has an up board pointing the way.
  // The turning sign stands where the straight line would carry on, so walking at the peak you meet it.
  const [hx, hz] = WAY_UP[0];
  const [h2x, h2z] = WAY_UP[1];
  const [tx, tz] = WAY_UP[TURN];
  const [ax, az] = WAY_UP[TURN - 1];
  const [nx, nz] = WAY_UP[TURN + 1];
  const ux = (h2x - hx) / Math.hypot(h2x - hx, h2z - hz), uz = (h2z - hz) / Math.hypot(h2x - hx, h2z - hz);
  const head = { x: hx + ux * 4 + uz * 1.8, z: hz + uz * 4 - ux * 1.8 };
  const ix = (tx - ax) / Math.hypot(tx - ax, tz - az), iz = (tz - az) / Math.hypot(tx - ax, tz - az);
  const turn = { x: tx + ix * 3.5, z: tz + iz * 3.5 };
  signpost(b, head.x, sampler.heightAt(head.x, head.z), head.z, ux, uz, -ux, -uz);
  signpost(b, turn.x, sampler.heightAt(turn.x, turn.z), turn.z, nx - tx, nz - tz, ax - tx, az - tz);
  colliders.push({ kind: 'circle', ...head, r: 0.11 + BIRD_BULK }, { kind: 'circle', ...turn, r: 0.11 + BIRD_BULK });
  detourSigns(b, sampler, detours, posts, colliders);

  const group = new THREE.Group();
  group.name = 'trail';
  const mesh = b.finish('trail-marks');
  mesh.userData.noCollide = true;
  group.add(mesh);
  return { group, colliders };
}
