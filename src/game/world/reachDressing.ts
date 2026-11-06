/**
 * The Frozen Reach, dressed. Critic round 66 crossed it as a featureless blue plane with little to
 * orient by. Two things a frozen lake in a lived-in valley has:
 *
 * - Margit's poles. She measures the ice ("forty-one centimetres at the centre"), so the safe line
 *   across it is marked the way people mark ice: a stick with a spruce bough and a red rag, from the
 *   foot of the boathouse hill past Skiff's boat and the ice hole to the skating lap. A row of them
 *   going off across the plane says how far things are and which way the line runs.
 * - Wind-packed snow. Pale drifts lying on the ice, all drawn out the same way, so the blue is broken
 *   up and the wind reads as a direction.
 *
 * Laid on the drawn ground (groundHeightAt) like the creek and the frozen ponds; the poles are one
 * merged mesh with a thin collider each.
 */

import * as THREE from 'three';
import { makeRng, type TerrainSampler } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import { PALETTE } from '../../core/palette';
import { ACTIVITIES } from '../../data/activities';
import { NPCS } from '../../data/npcs';
import { PICKUPS } from '../../data/pickups';
import { SLIDE_COURSES } from '../activities/slidePath';
import { GeoBuilder } from './geoBuilder';
import { groundHeightAt } from './groundHeight';

/** The marked line: off the foot of the sled run, between Margit and the ice hole, on to the lap. */
const LINE: readonly (readonly [number, number])[] = [
  [76, 284], [86, 304], [96, 322], [116, 338], [132, 362], [140, 382],
];
const POLE_EVERY = 9;
/** Poles stand this far to the right of the line, so it reads as a lane beside them. */
const POLE_SIDE = 1.6;

/** Wind from the west-north-west: every drift is drawn out along it. */
const WIND = 0.35;
const DRIFTS = 60;
const REACH = { x: 120, z: 330, r: 120 };

interface Spot { x: number; z: number; r: number }

/** Places the poles and drifts keep off: activities, villagers, pickups, the sled run and the lap. */
function keepOut(): Spot[] {
  const sled = SLIDE_COURSES['reach-sled-hill']?.points ?? [];
  const skate = ACTIVITIES.find((a) => a.id === 'reach-skate-race')?.pos;
  return [
    ...ACTIVITIES.map((a) => ({ x: a.pos.x, z: a.pos.z, r: a.radius + 4 })),
    ...NPCS.map((n) => ({ x: n.pos.x, z: n.pos.z, r: 4 })),
    ...PICKUPS.map((p) => ({ x: p.pos.x, z: p.pos.z, r: 2.5 })),
    ...sled.map((p) => ({ x: p.x, z: p.z, r: 7 })),
    // The skating lap curves away east of its post (skate.ts, a radius of 11).
    ...(skate ? [{ x: skate.x + 11, z: skate.z, r: 17 }] : []),
    // Skiff's boat.
    { x: 60, z: 300, r: 9 },
  ];
}

const clear = (spots: readonly Spot[], x: number, z: number, pad = 0): boolean =>
  spots.every((s) => Math.hypot(x - s.x, z - s.z) >= s.r + pad);

function poles(sampler: TerrainSampler, spots: readonly Spot[]): { mesh: THREE.Mesh; colliders: Collider[] } {
  const b = new GeoBuilder();
  const colliders: Collider[] = [];
  let carry = POLE_EVERY / 2;
  for (let i = 0; i < LINE.length - 1; i++) {
    const [ax, az] = LINE[i];
    const [bx, bz] = LINE[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const fx = (bx - ax) / len, fz = (bz - az) / len;
    for (let s = carry; s < len; s += POLE_EVERY) {
      // Right of travel under forward (fx, fz) is (-fz, fx).
      const x = ax + fx * s - fz * POLE_SIDE, z = az + fz * s + fx * POLE_SIDE;
      if (!clear(spots, x, z)) continue;
      const y = sampler.heightAt(x, z);
      const lean = (((x * 7.3 + z * 3.1) % 1) + 1) % 1 - 0.5;
      b.cyl(x, y - 0.2, z, 0.06, 2.8 + lean * 0.3, 'WOOD_DK');
      // The bough: two stacked green cones at the top, then the rag tied under them, big enough to
      // carry a few poles off.
      b.cone(x, y + 1.75, z, 0.44, 0.7, 'PINE_MID', 5);
      b.cone(x, y + 2.15, z, 0.3, 0.6, 'PINE_HI', 5);
      b.box(x + 0.1, y + 1.3, z, 0.05, 0.38, 0.5, 'PIP_SCARF');
      colliders.push({ kind: 'circle', x, z, r: 0.18 });
    }
    carry = POLE_EVERY - ((len - carry) % POLE_EVERY);
  }
  const mesh = b.finish('reach-poles');
  return { mesh, colliders };
}

/** One drift: a lumpy ellipse along the wind, pale in the middle, bluer at its thin edge. */
function drift(
  sampler: TerrainSampler, pos: number[], col: number[], cx: number, cz: number, len: number, wid: number, seed: number,
): void {
  const mid = new THREE.Color(PALETTE.SNOW_HI), rim = new THREE.Color(PALETTE.SNOW_LT);
  const ux = Math.cos(WIND), uz = Math.sin(WIND);
  const n = 14;
  const put = (x: number, z: number, k: THREE.Color): void => {
    pos.push(x, groundHeightAt(sampler, x, z) + 0.04, z);
    col.push(k.r, k.g, k.b);
  };
  const rimAt = (i: number): [number, number] => {
    const a = (i / n) * Math.PI * 2;
    const lump = 0.8 + 0.35 * Math.sin(a * 3 + seed) + 0.15 * Math.sin(a * 5 + seed * 2.3);
    const along = Math.cos(a) * len * lump, across = Math.sin(a) * wid * lump;
    return [cx + ux * along - uz * across, cz + uz * along + ux * across];
  };
  for (let i = 0; i < n; i++) {
    const [ax, az] = rimAt(i);
    const [bx, bz] = rimAt(i + 1);
    // Wound so the face points up.
    put(cx, cz, mid);
    put(bx, bz, rim);
    put(ax, az, rim);
  }
}

function drifts(sampler: TerrainSampler, spots: readonly Spot[], seed: number): THREE.Mesh {
  const rng = makeRng(seed ^ 0x2e1c7a93);
  const pos: number[] = [];
  const col: number[] = [];
  const placed: Spot[] = [];
  let guard = 0;
  while (placed.length < DRIFTS && guard++ < DRIFTS * 60) {
    const a = rng.range(0, Math.PI * 2), r = REACH.r * Math.sqrt(rng.next());
    const x = REACH.x + Math.cos(a) * r, z = REACH.z + Math.sin(a) * r;
    const len = rng.range(5, 14), wid = rng.range(1.8, 4.2);
    // The whole drift on flat ice: its middle and both ends.
    const ends = [[x, z], [x + Math.cos(WIND) * len, z + Math.sin(WIND) * len], [x - Math.cos(WIND) * len, z - Math.sin(WIND) * len]];
    if (ends.some(([px, pz]) => { const s = sampler.sampleAt(px, pz); return s.surface !== 'ice' || s.slope > 0.08; })) continue;
    if (!clear(spots, x, z, len * 0.6) || !clear(placed, x, z, 2)) continue;
    placed.push({ x, z, r: len });
    drift(sampler, pos, col, x, z, len, wid, rng.range(0, 10));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'reach-drifts';
  mesh.receiveShadow = true;
  return mesh;
}

export function buildReachDressing(sampler: TerrainSampler, seed: number): { group: THREE.Group; colliders: Collider[] } {
  const spots = keepOut();
  const group = new THREE.Group();
  group.name = 'reach-dressing';
  const marked = poles(sampler, spots);
  group.add(marked.mesh, drifts(sampler, spots, seed));
  return { group, colliders: marked.colliders };
}
