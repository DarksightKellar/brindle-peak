/**
 * The Pinewind creek: open water rising under the split pine's roots, a pool where it is fished,
 * and a run down past Fen's perch to the edge of the wood.
 *
 * Hollis says "the pines, creek side", Fen says the mitten is "under the roots of the split pine,
 * creek side", and the wood had a fishing spot called Creek Pool on bare snow. This draws that
 * creek. It is a decal on the snow, not a channel: a dark water strip edged with shelves of ice,
 * laid exactly on the drawn terrain triangles (groundHeight.ts) so it neither sinks nor floats, and
 * dressed with snow-capped stones along both banks. Walkable, like real shallow water in a hard frost.
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import { GEO, GeoBuilder, propMatrix } from './geoBuilder';
import { groundHeightAt } from './groundHeight';
import { lin } from './waterMesh';

/** Centre line, from the spring under the split pine's roots down to the wood's edge. */
export const CREEK: readonly (readonly [number, number])[] = [
  [-228.5, 116.5], [-236, 113.5], [-246, 111.5], [-255, 110], [-262, 108], [-264, 100], [-264.5, 92],
  [-264, 86], [-268, 78], [-275, 71], [-284, 64], [-294, 57], [-305, 51],
];
/** The pool the Creek Pool fishing spot looks into: open water, ringed by an ice shelf. */
export const CREEK_POOL = { x: -262, z: 108, water: 2.7, ice: 4.7 } as const;
/** The spring under the split pine's roots, where the creek rises. */
const SPRING = { x: -229.2, z: 117, water: 1.1, ice: 1.9 } as const;
/** Half widths of the water and of the water plus its ice shelf, growing as the creek runs. */
const WATER = [0.6, 1.05];
const SHELF = [1.15, 1.8];

/** Horizontal distance from (x, z) to the creek's centre line. */
export function creekDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < CREEK.length - 1; i++) {
    const [ax, az] = CREEK[i];
    const [bx, bz] = CREEK[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return Math.min(best, Math.hypot(x - CREEK_POOL.x, z - CREEK_POOL.z) - CREEK_POOL.ice + SHELF[1]);
}

/** Points every ~1.2 u along the line, each with its unit side vector and how far down it is (0..1). */
function walk(): { x: number; z: number; sx: number; sz: number; f: number }[] {
  const out: { x: number; z: number; sx: number; sz: number; f: number }[] = [];
  let total = 0;
  for (let i = 0; i < CREEK.length - 1; i++) total += Math.hypot(CREEK[i + 1][0] - CREEK[i][0], CREEK[i + 1][1] - CREEK[i][1]);
  let run = 0;
  for (let i = 0; i < CREEK.length - 1; i++) {
    const [ax, az] = CREEK[i];
    const [bx, bz] = CREEK[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.round(len / 1.2));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      // A gentle meander, so the banks are not ruled lines.
      const wob = 0.35 * Math.sin((run + len * t) * 0.45);
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, sx: -(bz - az) / len, sz: (bx - ax) / len, f: (run + len * t) / total });
      out[out.length - 1].x += out[out.length - 1].sx * wob;
      out[out.length - 1].z += out[out.length - 1].sz * wob;
    }
    run += len;
  }
  const [lx, lz] = CREEK[CREEK.length - 1];
  const p = out[out.length - 1];
  out.push({ x: lx, z: lz, sx: p.sx, sz: p.sz, f: 1 });
  return out;
}

export function buildCreek(sampler: TerrainSampler): THREE.Group {
  const group = new THREE.Group();
  group.name = 'creek';
  const pos: number[] = [];
  const col: number[] = [];
  const at = (x: number, z: number, lift: number): number[] => [x, groundHeightAt(sampler, x, z) + lift, z];
  const tri = (a: number[], b: number[], c: number[], k: THREE.Color): void => {
    // Wind each triangle upward, whatever order its corners came in.
    const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) >= 0;
    pos.push(...a, ...(up ? b : c), ...(up ? c : b));
    for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b);
  };
  const deep = lin('WATER_DEEP'), mid = lin('ICE_DEEP'), shelf = lin('ICE_HI'), rim = lin('SNOW_LT');
  const water = new THREE.Color();

  const pts = walk();
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    const w0 = WATER[0] + (WATER[1] - WATER[0]) * p.f, w1 = WATER[0] + (WATER[1] - WATER[0]) * q.f;
    const s0 = SHELF[0] + (SHELF[1] - SHELF[0]) * p.f, s1 = SHELF[0] + (SHELF[1] - SHELF[0]) * q.f;
    water.copy(deep).lerp(mid, 0.25 + 0.2 * Math.sin(i * 0.9));
    const pl = at(p.x + p.sx * w0, p.z + p.sz * w0, 0.05), pr = at(p.x - p.sx * w0, p.z - p.sz * w0, 0.05);
    const ql = at(q.x + q.sx * w1, q.z + q.sz * w1, 0.05), qr = at(q.x - q.sx * w1, q.z - q.sz * w1, 0.05);
    tri(pl, pr, qr, water);
    tri(pl, qr, ql, water);
    for (const side of [1, -1]) {
      const a = at(p.x + side * p.sx * w0, p.z + side * p.sz * w0, 0.07), b = at(q.x + side * q.sx * w1, q.z + side * q.sz * w1, 0.07);
      const c = at(q.x + side * q.sx * s1, q.z + side * q.sz * s1, 0.07), d = at(p.x + side * p.sx * s0, p.z + side * p.sz * s0, 0.07);
      const k = (i + (side > 0 ? 0 : 1)) % 3 === 0 ? rim : shelf;
      tri(a, b, c, k);
      tri(a, c, d, k);
    }
  }

  // The fishing pool and the spring: open discs of dark water inside rings of shelf ice.
  for (const pool of [CREEK_POOL, SPRING]) {
    const { x: cx, z: cz } = pool;
    const n = 18;
    for (let s = 0; s < n; s++) {
      const a0 = (s / n) * Math.PI * 2, a1 = ((s + 1) / n) * Math.PI * 2;
      const r = (a: number, k: number): number => k * (1 + 0.08 * Math.sin(a * 3));
      const ring = (a: number, k: number, lift: number): number[] => at(cx + Math.cos(a) * r(a, k), cz + Math.sin(a) * r(a, k), lift);
      tri(at(cx, cz, 0.06), ring(a0, pool.water, 0.06), ring(a1, pool.water, 0.06), deep);
      tri(ring(a0, pool.water, 0.08), ring(a0, pool.ice, 0.08), ring(a1, pool.ice, 0.08), shelf);
      tri(ring(a0, pool.water, 0.08), ring(a1, pool.ice, 0.08), ring(a1, pool.water, 0.08), shelf);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const strip = new THREE.Mesh(geometry, material);
  strip.name = 'creek-water';
  group.add(strip);

  // Bank stones, alternating sides, snow on whatever faces up.
  const b = new GeoBuilder();
  for (let i = 3; i < pts.length; i += 4) {
    const p = pts[i];
    const side = i % 8 < 4 ? 1 : -1;
    const off = SHELF[0] + (SHELF[1] - SHELF[0]) * p.f + 0.4;
    const x = p.x + side * p.sx * off, z = p.z + side * p.sz * off;
    const s = 0.35 + 0.25 * ((i * 37) % 5) / 5;
    b.add(GEO.ico, propMatrix(x, groundHeightAt(sampler, x, z) + s * 0.3, z, s * 1.3, s * 0.8, s, i), 'ROCK_MID', 'SNOW_LT', 0.5);
  }
  group.add(b.finish('creek-stones'));
  return group;
}
