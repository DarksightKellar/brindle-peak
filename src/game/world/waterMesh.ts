/**
 * Mesh primitives shared by the ice sheet, the spring pools and the steam: palette conversion into the
 * renderer's working space, and the triangle accumulator that produces a flat-shaded, vertex-coloured
 * geometry with world-space UVs.
 *
 * Split from `water.ts` so that file is only about what the water looks like and where it is.
 */

import * as THREE from 'three';
import type { RGB } from '../../core/contracts';
import type { PaletteKey } from '../../core/palette';
import { paletteRgb } from '../../core/palette';
import { GROUND_TILE_WORLD } from './groundTexture';
import type { Mesh3 } from './water';

export function lin(key: PaletteKey): THREE.Color {
  const c: RGB = paletteRgb(key);
  return new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
}

export function tri(m: Mesh3, a: number[], b: number[], c: number[], k: THREE.Color): void {
  m.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  m.col.push(k.r, k.g, k.b, k.r, k.g, k.b, k.r, k.g, k.b);
  for (const p of [a, b, c]) m.uv.push(p[0] / GROUND_TILE_WORLD, p[2] / GROUND_TILE_WORLD);
}

/** Triangle whose normal is forced upward, whatever order the corners arrive in. */
export function upTri(m: Mesh3, a: number[], b: number[], c: number[], k: THREE.Color): void {
  const bx = b[0] - a[0], bz = b[2] - a[2];
  const cx = c[0] - a[0], cz = c[2] - a[2];
  if (bz * cx - bx * cz >= 0) tri(m, a, b, c, k);
  else tri(m, a, c, b, k);
}

export function finish(m: Mesh3, name: string, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.pos), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.col), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(m.uv), 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

