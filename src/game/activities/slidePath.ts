/**
 * The line a sled run follows, and the courses written for it.
 *
 * The old run was a straight 110 u bearing simulated off to one side: Pip never moved, and the Otter
 * Slide post stood on the flat top of the Kettle Springs plateau. A course is now a centre line laid
 * down a real slope (checked against the heightfield and the tree colliders), smoothed into a curve.
 * The sled rides it, the player steers across it, and rings hang at alternating sides so steering is
 * the game rather than decoration.
 *
 * Kettle Springs is gentle ground: the best line in the zone drops 15 u over its south flank before it
 * levels out at the Pinewind edge. The course swings across that flank so the run lasts, and the
 * physics in sled.ts are tuned for this grade, not for a cliff.
 */

import type { ActivityDef, TerrainSampler, Vec2 } from '../../core/contracts';

export interface SlideCourse {
  /** Centre line, start first. The first point is where the sled sets off, beside the post. */
  readonly points: readonly Vec2[];
  /** How far either side of the centre line the sled can steer. */
  readonly halfWidth: number;
  /** One lateral offset per ring (+ is to the rider's right); rings are spaced evenly down the run. */
  readonly rings: readonly number[];
}

export const SLIDE_COURSES: Readonly<Record<string, SlideCourse>> = {
  // Off the south lip of the springs plateau, three wide swings down the flank, out onto the flat.
  'kettles-otter-slide': {
    halfWidth: 4.5,
    points: [
      { x: -44, z: 87 },
      { x: -38, z: 98 },
      { x: -22, z: 107 },
      { x: -14, z: 118 },
      { x: -26, z: 128 },
      { x: -50, z: 134 },
      { x: -66, z: 143 },
      { x: -67, z: 155 },
      { x: -52, z: 163 },
      { x: -28, z: 167 },
      { x: -16, z: 177 },
      { x: -16, z: 187 },
      { x: -6, z: 194 },
    ],
    rings: [2.2, -2.4, 2.6, -2.2, 2.4, -2.6, 2.2, -2.4, 2.6, -2.2, 2.4, -2.4],
  },
  /*
   * The Frozen Reach is a lake: the old post stood on the ice and the "hill" was a 110 u push across
   * the flat at walking pace. The one real slope in the zone is the north shore, which falls 7 u to the
   * ice in about 50. The run swings twice down it, shoots out onto the ice and glides the long way
   * across the bay to finish by the boathouse.
   */
  'reach-sled-hill': {
    halfWidth: 4.5,
    points: [
      { x: 104, z: 182 },
      { x: 100, z: 194 },
      { x: 108, z: 206 },
      { x: 100, z: 220 },
      { x: 90, z: 234 },
      { x: 80, z: 252 },
      { x: 72, z: 266 },
      { x: 68, z: 279 },
    ],
    rings: [2.2, -2.4, 2.4, -2.2, 2.4],
  },
};

/** A smoothed centre line sampled every `SAMPLE` u, with its running length. */
export interface SlidePath {
  readonly xs: readonly number[];
  readonly zs: readonly number[];
  readonly length: number;
}

const SAMPLE = 0.5;

/** Uniform Catmull-Rom through the points, resampled to an even spacing so distance is arc length. */
export function buildPath(points: readonly Vec2[]): SlidePath {
  const dense: Vec2[] = [];
  const at = (i: number): Vec2 => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      dense.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  dense.push(points[points.length - 1]);

  const xs = [dense[0].x];
  const zs = [dense[0].z];
  let carried = 0;
  for (let i = 1; i < dense.length; i++) {
    const ax = dense[i - 1].x, az = dense[i - 1].z;
    const seg = Math.hypot(dense[i].x - ax, dense[i].z - az);
    let d = SAMPLE - carried;
    while (d <= seg) {
      xs.push(ax + ((dense[i].x - ax) * d) / seg);
      zs.push(az + ((dense[i].z - az) * d) / seg);
      d += SAMPLE;
    }
    carried = seg - (d - SAMPLE);
  }
  return { xs, zs, length: (xs.length - 1) * SAMPLE };
}

export interface PathPoint {
  x: number;
  z: number;
  /** Unit direction of travel. */
  dx: number;
  dz: number;
}

/** Point and heading `s` u along the path; past either end it carries straight on. */
export function pathAt(path: SlidePath, s: number): PathPoint {
  const last = path.xs.length - 1;
  const i = Math.max(0, Math.min(last - 1, Math.floor(s / SAMPLE)));
  const dx0 = path.xs[i + 1] - path.xs[i];
  const dz0 = path.zs[i + 1] - path.zs[i];
  const len = Math.hypot(dx0, dz0) || 1;
  const t = s / SAMPLE - i; // runs past 0..1 at the ends, which extrapolates along the end segment
  return { x: path.xs[i] + dx0 * t, z: path.zs[i] + dz0 * t, dx: dx0 / len, dz: dz0 / len };
}

/** Downhill if the terrain has one; otherwise a heading seeded off the post, so a flat course still runs. */
function fallHeading(def: ActivityDef, terrain: TerrainSampler): Vec2 {
  const n = terrain.normalAt(def.pos.x, def.pos.z);
  const len = Math.hypot(n.x, n.z);
  if (len > 0.02) return { x: n.x / len, z: n.z / len };
  const a = (Math.abs(def.pos.x * 37 + def.pos.z * 11) % 6283) / 1000;
  return { x: Math.sin(a), z: Math.cos(a) };
}

/** World units of an unauthored run. */
export const DEFAULT_COURSE = 110;

/** The authored course for a sled post, or a straight run down its fall line of `length` u. */
export function slideCourseFor(def: ActivityDef, terrain: TerrainSampler, length = DEFAULT_COURSE): SlideCourse {
  const authored = SLIDE_COURSES[def.id];
  if (authored) return authored;
  const h = fallHeading(def, terrain);
  const rings: number[] = [];
  for (let d = 30; d < length - 10; d += 25) rings.push(rings.length % 2 === 0 ? 2.2 : -2.2);
  return {
    halfWidth: 4.5,
    points: [def.pos, { x: def.pos.x + h.x * length, z: def.pos.z + h.z * length }],
    rings,
  };
}

/** Distance along the run of ring `i` of `count`: evenly spread, clear of the start and the finish. */
export function ringDistance(i: number, count: number, length: number): number {
  const first = Math.min(24, length * 0.2);
  const last = length - Math.min(14, length * 0.1);
  return count <= 1 ? (first + last) / 2 : first + ((last - first) * i) / (count - 1);
}
