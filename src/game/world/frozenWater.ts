/**
 * Frozen water laid on the snow: a stream, a stepped cascade, a small pond. The way up had three
 * stretches of open snow where nothing happened for most of a minute; frozen water is the cheapest
 * thing in a winter valley that is plainly worth a look, and it says which way the ground falls.
 *
 * Built like the Pinewind creek (creek.ts): a decal on the drawn ground (groundHeightAt), wound
 * upward, polygon-offset so it never fights the terrain, with snow-capped stones on the banks. All
 * ice, no open water: pale blue down the middle where it is thick, deeper blue at the edges, and a
 * few dark cracks across it.
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import { GEO, GeoBuilder, propMatrix } from './geoBuilder';
import { groundHeightAt } from './groundHeight';
import { lin } from './waterMesh';

type Path = readonly (readonly [number, number])[];

interface Decal {
  tri(a: number[], b: number[], c: number[], k: THREE.Color): void;
  at(x: number, z: number, lift: number): number[];
  finish(name: string): THREE.Mesh;
}

function decal(sampler: TerrainSampler): Decal {
  const pos: number[] = [];
  const col: number[] = [];
  return {
    at: (x, z, lift) => [x, groundHeightAt(sampler, x, z) + lift, z],
    tri(a, b, c, k) {
      const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) >= 0;
      pos.push(...a, ...(up ? b : c), ...(up ? c : b));
      for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b);
    },
    finish(name) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshLambertMaterial({
        vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      return mesh;
    },
  };
}

/** Points every `step` u along a path, with the unit sideways vector at each. */
function walk(path: Path, step: number): { x: number; z: number; sx: number; sz: number; f: number }[] {
  const out: { x: number; z: number; sx: number; sz: number; f: number }[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  let s = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let t = 0; t < len; t += step) out.push({ x: ax + dx * t, z: az + dz * t, sx: -dz, sz: dx, f: (s + t) / total });
    s += len;
  }
  const [lx, lz] = path[path.length - 1];
  const prev = out[out.length - 1];
  out.push({ x: lx, z: lz, sx: prev.sx, sz: prev.sz, f: 1 });
  return out;
}

/**
 * A frozen stream along `path`, `width` across (growing by `grow` toward the end), with bank stones.
 * `skipNear` leaves its stones out of a disc (a footbridge, a trail).
 */
export function frozenStream(
  sampler: TerrainSampler, path: Path, width: number, grow: number, skipNear?: { x: number; z: number; r: number },
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'frozen-stream';
  const d = decal(sampler);
  const thick = lin('ICE_HI'), edge = lin('ICE_MID'), crack = lin('ICE_DEEP'), lip = lin('SNOW_HI');
  const pts = walk(path, 1.5);
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    const w0 = (width + grow * p.f) / 2, w1 = (width + grow * q.f) / 2;
    const inner0 = w0 * 0.55, inner1 = w1 * 0.55;
    const c = i % 7 === 3 ? crack : thick;
    const P = (o: number, s: number, lift: number): number[] => d.at(p.x + p.sx * o * s, p.z + p.sz * o * s, lift);
    const Q = (o: number, s: number, lift: number): number[] => d.at(q.x + q.sx * o * s, q.z + q.sz * o * s, lift);
    d.tri(P(inner0, 1, 0.06), P(inner0, -1, 0.06), Q(inner1, -1, 0.06), c);
    d.tri(P(inner0, 1, 0.06), Q(inner1, -1, 0.06), Q(inner1, 1, 0.06), c);
    for (const side of [1, -1]) {
      d.tri(P(inner0, side, 0.06), P(w0, side, 0.06), Q(w1, side, 0.06), edge);
      d.tri(P(inner0, side, 0.06), Q(w1, side, 0.06), Q(inner1, side, 0.06), edge);
      // A thin lip of snow drifted onto the edge of the ice.
      d.tri(P(w0, side, 0.08), P(w0 + 0.35, side, 0.08), Q(w1 + 0.35, side, 0.08), lip);
      d.tri(P(w0, side, 0.08), Q(w1 + 0.35, side, 0.08), Q(w1, side, 0.08), lip);
    }
  }
  group.add(d.finish('frozen-stream-ice'));

  const b = new GeoBuilder();
  for (let i = 2; i < pts.length; i += 3) {
    const p = pts[i];
    const side = i % 6 < 3 ? 1 : -1;
    const off = (width + grow * p.f) / 2 + 0.6;
    const x = p.x + side * p.sx * off, z = p.z + side * p.sz * off;
    if (skipNear && Math.hypot(x - skipNear.x, z - skipNear.z) < skipNear.r) continue;
    const s = 0.35 + (0.3 * ((i * 37) % 5)) / 5;
    b.add(GEO.ico, propMatrix(x, groundHeightAt(sampler, x, z) + s * 0.3, z, s * 1.3, s * 0.8, s, i), 'ROCK_MID', 'SNOW_LT', 0.5);
  }
  group.add(b.finish('frozen-stream-stones'));
  return group;
}

/**
 * A small frozen pond: a wobbly disc of ice inside a ring of snow lip. With `frost`, the same shape in
 * white: a floor of hoarfrost, brighter than the blue snow round it.
 */
export function frozenPond(sampler: TerrainSampler, cx: number, cz: number, r: number, frost = false): THREE.Mesh {
  const d = decal(sampler);
  const thick = lin(frost ? 'SNOW_HI' : 'ICE_HI'), edge = lin(frost ? 'SNOW_LT' : 'ICE_MID');
  const lip = lin('SNOW_HI'), crack = lin('ICE_DEEP');
  const n = 22;
  const rad = (a: number, k: number): number => r * k * (1 + 0.1 * Math.sin(a * 3 + cx) + 0.06 * Math.sin(a * 5));
  const ring = (a: number, k: number, lift: number): number[] => d.at(cx + Math.cos(a) * rad(a, k), cz + Math.sin(a) * rad(a, k), lift);
  for (let s = 0; s < n; s++) {
    const a0 = (s / n) * Math.PI * 2, a1 = ((s + 1) / n) * Math.PI * 2;
    d.tri(d.at(cx, cz, 0.06), ring(a0, 0.6, 0.06), ring(a1, 0.6, 0.06), !frost && s % 9 === 4 ? crack : thick);
    d.tri(ring(a0, 0.6, 0.06), ring(a0, 1, 0.06), ring(a1, 1, 0.06), edge);
    d.tri(ring(a0, 0.6, 0.06), ring(a1, 1, 0.06), ring(a1, 0.6, 0.06), edge);
    d.tri(ring(a0, 1, 0.08), ring(a0, 1.12, 0.08), ring(a1, 1.12, 0.08), lip);
    d.tri(ring(a0, 1, 0.08), ring(a1, 1.12, 0.08), ring(a1, 1, 0.08), lip);
  }
  return d.finish('frozen-pond');
}

/**
 * A fringe of icicles hanging from (x, y, z), `n` of them across ~2.2 u along x, uneven lengths.
 * Turned over rather than scaled negative, so their faces still wind outward.
 */
export function icicles(b: GeoBuilder, x: number, y: number, z: number, n: number, seed: number): void {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const len = 0.7 + 0.9 * (((seed + i * 37) % 7) / 7);
    const ox = x + t * 2.2, oz = z + 0.15 * Math.sin(i * 2.3 + seed);
    b.add(GEO.cone5, propMatrix(ox, y - len / 2, oz, 0.16, len, 0.16, 0, Math.PI), i % 2 ? 'ICE_HI' : 'ICE_MID');
  }
}
