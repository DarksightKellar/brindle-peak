/**
 * Kettle Springs, dressed. The scatter gives the Kettles zone no props at all (scatterRules.ts), so
 * the basin the trail crosses was one sheet of thin blue snow with five stone rings in it. Changing
 * the scatter's quota would reshuffle every tree in the valley that a race course was checked against,
 * so the basin is dressed here instead, with its own seed: warm stones and boulders near the pools,
 * dead pale trees killed by the steam, brush and drifts further out, and by the trail a bench and a
 * short boardwalk to the big pool, where people come to sit in the warm.
 *
 * Clear of the pools, the villagers, every activity's spot and the trail itself.
 */

import * as THREE from 'three';
import { makeRng, type TerrainSampler } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import { ACTIVITIES } from '../../data/activities';
import { NPCS } from '../../data/npcs';
import { PICKUPS } from '../../data/pickups';
import { SPRING_POOLS } from './landmarks';
import { createPropMesh, type PropKind } from './props';
import { solidOf } from './colliders';
import { GeoBuilder } from './geoBuilder';
import { wayDistance } from './trail';

const CENTRE = { x: -40, z: 58 };
const INNER = 9;
const OUTER = 105;
const COUNT = 70;
/** Kind, chance weight and scale range. */
const MIX: readonly { kind: PropKind; w: number; scale: [number, number] }[] = [
  { kind: 'rock', w: 0.42, scale: [0.7, 1.5] },
  { kind: 'bare', w: 0.2, scale: [0.9, 1.3] },
  { kind: 'brush', w: 0.22, scale: [0.8, 1.3] },
  { kind: 'drift', w: 0.16, scale: [0.9, 1.6] },
];

/** Where a prop may not stand, and how close. */
function blocked(x: number, z: number): boolean {
  for (const p of SPRING_POOLS) if (Math.hypot(x - p.x, z - p.z) < p.r + 3) return true;
  for (const n of NPCS) if (Math.hypot(x - n.pos.x, z - n.pos.z) < 5) return true;
  for (const a of ACTIVITIES) if (Math.hypot(x - a.pos.x, z - a.pos.z) < a.radius + 5) return true;
  for (const p of PICKUPS) if (Math.hypot(x - p.pos.x, z - p.pos.z) < 3) return true;
  return wayDistance(x, z) < 4.5;
}

export interface KettlesDressing {
  group: THREE.Group;
  colliders: Collider[];
}

/** The bench and the boardwalk out to the big pool's south rim, from the trail. */
function bench(sampler: TerrainSampler): THREE.Mesh {
  const b = new GeoBuilder();
  const at = (x: number, z: number): number => sampler.heightAt(x, z);
  // Boardwalk: planks every 0.45 u from the trail (-38, 41) north to the rim (-40, 55).
  for (let t = 0; t <= 1; t += 0.035) {
    const x = -38 - 2 * t, z = 41 + 14 * t;
    b.box(x, at(x, z) - 0.02, z, 1.5, 0.1, 0.32, 'WOOD_LT', 'SNOW_LT');
  }
  const bx = -34.5, bz = 47;
  const by = at(bx, bz);
  b.box(bx, by + 0.42, bz, 0.5, 0.08, 1.8, 'WOOD_LT', 'SNOW_LT');
  for (const dz of [-0.75, 0.75]) b.box(bx, by - 0.1, bz + dz, 0.4, 0.52, 0.1, 'WOOD_DK');
  // A towel left over the end, the warm colour the springs are short of.
  b.box(bx + 0.02, by + 0.2, bz - 0.6, 0.54, 0.34, 0.3, 'BRICK');
  return b.finish('kettles-bench');
}

export function buildKettlesDressing(sampler: TerrainSampler, seed: number): KettlesDressing {
  const rng = makeRng(seed ^ 0x6b3771e5);
  const picks: { kind: PropKind; variant: number; x: number; z: number; yaw: number; scale: number }[] = [];
  let guard = 0;
  while (picks.length < COUNT && guard++ < COUNT * 40) {
    const a = rng.range(0, Math.PI * 2);
    // Denser near the pools, thinning outward: the square of a uniform draw.
    const r = INNER + (OUTER - INNER) * rng.next() ** 1.6;
    const x = CENTRE.x + Math.cos(a) * r, z = CENTRE.z + Math.sin(a) * r;
    const s = sampler.sampleAt(x, z);
    if (s.zone !== 'kettles' || s.slope > 0.6 || blocked(x, z)) continue;
    if (picks.some((p) => Math.hypot(p.x - x, p.z - z) < 3.2)) continue;
    let roll = rng.next();
    const m = MIX.find((k) => (roll -= k.w) <= 0) ?? MIX[0];
    // Near a pool the stone is warm and bare; the dead trees stand back from the steam.
    if (m.kind === 'bare' && r < 25) continue;
    picks.push({ kind: m.kind, variant: rng.int(0, 1), x, z, yaw: rng.range(0, Math.PI * 2), scale: rng.range(m.scale[0], m.scale[1]) });
  }

  const group = new THREE.Group();
  group.name = 'kettles-dressing';
  const buckets = new Map<string, typeof picks>();
  for (const p of picks) {
    const key = `${p.kind}:${p.variant}`;
    buckets.set(key, [...(buckets.get(key) ?? []), p]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [key, list] of buckets) {
    const [kind, variant] = key.split(':');
    const proto = createPropMesh(kind as PropKind, Number(variant));
    const mesh = new THREE.InstancedMesh(proto.geometry, proto.material as THREE.Material, list.length);
    mesh.name = `kettles:${key}`;
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.yaw);
      mesh.setMatrixAt(i, m4.compose(v.set(p.x, sampler.heightAt(p.x, p.z), p.z), q, sc.setScalar(p.scale)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
  const seat = bench(sampler);
  seat.userData.noCollide = true;
  group.add(seat);

  const colliders: Collider[] = picks.flatMap((p) => solidOf(p.kind, p.variant, p.x, p.z, p.yaw, p.scale));
  colliders.push({ kind: 'box', x: -34.5, z: 47, hw: 0.3, hd: 0.95, yaw: 0 });
  return { group, colliders };
}
