/**
 * The geometry toolkit props are built with: unit primitives, the palette conversion, the transform
 * helper, and `GeoBuilder`, which accumulates triangles and vertex colours into one mesh.
 *
 * Split out of `props.ts`, which had two jobs: knowing what a prop looks like, and being the
 * machinery for building any of them. `landmarks.ts` already needed the machinery and nothing else,
 * which is what made the seam obvious.
 */

import * as THREE from 'three';
import { installViewFade } from '../render/viewFade';
import type { PaletteKey } from '../../core/palette';
import { paletteRgb } from '../../core/palette';

export type Triple = readonly [number, number, number];

const cache = new Map<PaletteKey, Triple>();
const tint = new THREE.Color();

/** Palette sRGB -> renderer working space, exactly the conversion terrainMesh uses. */
function lin(key: PaletteKey): Triple {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = paletteRgb(key);
  tint.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
  const t: Triple = [tint.r, tint.g, tint.b];
  cache.set(key, t);
  return t;
}

/** Unit primitives, tessellated once. Their triangle counts are the budget's unit of money. */
const plain = (g: THREE.BufferGeometry): THREE.BufferGeometry => (g.index ? g.toNonIndexed() : g);
export const GEO = {
  box: plain(new THREE.BoxGeometry(1, 1, 1)), // 12
  quad: plain(new THREE.PlaneGeometry(1, 1)), // 2
  cone5: plain(new THREE.ConeGeometry(1, 1, 5, 1, true)), // 5
  cone6: plain(new THREE.ConeGeometry(1, 1, 6, 1, true)), // 6
  cyl3: plain(new THREE.CylinderGeometry(1, 1, 1, 3, 1, true)), // 6
  cyl5: plain(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true)), // 10
  stump: plain(new THREE.CylinderGeometry(1, 1, 1, 5, 1, false)), // 20
  ico: plain(new THREE.IcosahedronGeometry(1, 0)), // 20
  ico1: plain(new THREE.IcosahedronGeometry(1, 1)), // 80: round enough to read as rolled snow, not a gem
  octa: plain(new THREE.OctahedronGeometry(1, 0)), // 8
  tetra: plain(new THREE.TetrahedronGeometry(1, 0)), // 4
};

const shift = new THREE.Vector3(), rot = new THREE.Quaternion();
const euler = new THREE.Euler(), span = new THREE.Vector3();

/** Translate, scale, then rotate (YXZ); every primitive is authored about the origin. */
export const propMatrix = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(shift.set(x, y, z), rot.setFromEuler(euler.set(rx, ry, rz)), span.set(sx, sy, sz));

/** Accumulates triangles and their vertex colours, then hands back one mesh. */
export class GeoBuilder {
  private readonly pos: number[][] = [[], []];
  private readonly col: number[][] = [[], []];
  private readonly v = new THREE.Vector3();
  private bucket = 0;

  /** Route subsequent geometry into the unlit/emissive bucket (own material, own group). */
  glow(on = true): void { this.bucket = on ? 1 : 0; }

  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: PaletteKey, top?: PaletteKey, topMin = 0.6): void {
    const src = geo.getAttribute('position') as THREE.BufferAttribute;
    const pos = this.pos[this.bucket];
    const col = this.col[this.bucket];
    const base = lin(color);
    const cap = top ? lin(top) : base;
    for (let i = 0; i < src.count; i += 3) {
      const t: number[] = [];
      for (let k = 0; k < 3; k++) {
        this.v.fromBufferAttribute(src, i + k).applyMatrix4(m);
        t.push(this.v.x, this.v.y, this.v.z);
      }
      const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2];
      const wx = t[6] - t[0], wy = t[7] - t[1], wz = t[8] - t[2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const c = ny / (Math.hypot(nx, ny, nz) || 1) > topMin ? cap : base;
      pos.push(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]);
      col.push(c[0], c[1], c[2], c[0], c[1], c[2], c[0], c[1], c[2]);
    }
  }

  /** Winding is corrected against `out`, an exterior reference point, so faces never vanish. */
  tri(a: Triple, b: Triple, c: Triple, color: PaletteKey, out?: Triple): void {
    const k = lin(color);
    let bx = b, cx = c;
    if (out) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const ox = out[0] - (a[0] + b[0] + c[0]) / 3, oy = out[1] - (a[1] + b[1] + c[1]) / 3, oz = out[2] - (a[2] + b[2] + c[2]) / 3;
      if (nx * ox + ny * oy + nz * oz < 0) { bx = c; cx = b; }
    }
    this.pos[this.bucket].push(a[0], a[1], a[2], bx[0], bx[1], bx[2], cx[0], cx[1], cx[2]);
    this.col[this.bucket].push(k[0], k[1], k[2], k[0], k[1], k[2], k[0], k[1], k[2]);
  }

  quad(a: Triple, b: Triple, c: Triple, d: Triple, color: PaletteKey, out?: Triple): void {
    this.tri(a, b, c, color, out);
    this.tri(a, c, d, color, out);
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, color: PaletteKey, top?: PaletteKey): void {
    this.add(GEO.box, propMatrix(x, y + h / 2, z, w, h, d), color, top);
  }

  cone(x: number, y: number, z: number, r: number, h: number, color: PaletteKey, sides = 6): void {
    this.add(sides === 5 ? GEO.cone5 : GEO.cone6, propMatrix(x, y + h / 2, z, r, h, r), color);
  }

  cyl(x: number, y: number, z: number, r: number, h: number, color: PaletteKey): void {
    this.add(GEO.cyl5, propMatrix(x, y + h / 2, z, r, h, r), color);
  }

  /** Thin round member between two points — branches, ropes, mast legs, guy wires. */
  strut(a: Triple, b: Triple, r: number, color: PaletteKey): void {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1e-3;
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(dx / len, dy / len, dz / len));
    const at = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    this.add(GEO.cyl3, new THREE.Matrix4().compose(at, q, new THREE.Vector3(r, len, r)), color);
  }

  finish(name: string, doubleSided = false): THREE.Mesh {
    const [p0, p1] = this.pos;
    const [c0, c1] = this.col;
    const position = new Float32Array(p0.length + p1.length);
    position.set(p0);
    position.set(p1, p0.length);
    const color = new Float32Array(c0.length + c1.length);
    color.set(c0);
    color.set(c1, c0.length);

    /*
     * Per-facet two-tone.
     *
     * Props are silhouettes, but a silhouette with one flat colour per tier reads as cut paper.
     * Multiplying each *triangle* by a small deterministic tone (0.90-1.06) gives every facet its
     * own value while keeping the palette intact — the same chunky hand-painted read a two-tone
     * texture would give, at zero texture cost, zero UVs, and zero extra draw calls. The glow
     * bucket is left alone: an emissive lantern should not flicker facet to facet.
     */
    for (let t = 0; t < c0.length / 9; t++) {
      const at = t * 9;
      const hx = position[at] + position[at + 3] + position[at + 6];
      const hy = position[at + 1] + position[at + 4] + position[at + 7];
      const hz = position[at + 2] + position[at + 5] + position[at + 8];
      const n = (((Math.sin(hx * 12.9898 + hy * 31.13 + hz * 78.233) * 43758.5453) % 1) + 1) % 1;
      const tone = 0.9 + n * 0.16;
      for (let v = 0; v < 9; v += 3) {
        color[at + v] *= tone;
        color[at + v + 1] *= tone;
        color[at + v + 2] *= tone;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const side = doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    const solid = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side });
    // Every prop, NPC and landmark is built through here, so this is the one place that catches all
    // the things a player can stand behind.
    installViewFade(solid);
    if (p1.length === 0) {
      const mesh = new THREE.Mesh(geometry, solid);
      mesh.name = name;
      return mesh;
    }
    // ART_BIBLE A3: unlit geometry must never be overridden by the normal pass.
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    glow.allowOverride = false;
    installViewFade(glow);
    geometry.addGroup(0, p0.length / 3, 0);
    geometry.addGroup(p0.length / 3, p1.length / 3, 1);
    const mesh = new THREE.Mesh(geometry, [solid, glow]);
    mesh.name = name;
    return mesh;
  }
}

