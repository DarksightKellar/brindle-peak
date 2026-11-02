/**
 * Window light on the snow: a soft warm pool laid on the ground in front of each lit window.
 *
 * The hamlet square is trodden snow, and at dusk snow goes blue. The lit windows were the only warm
 * thing in the frame, and a window alone reads as a sticker on a wall. A pool of the same amber on
 * the snow below it is what says "someone is home" — the bible's rule that snow-blue and lamp-amber
 * share every frame.
 *
 * One fan per window, vertex alpha falling from the sill to nothing, additive so it lifts the snow
 * toward lamplight instead of painting it orange. Each rim vertex follows the terrain height, so a
 * pool on a slope does not float or clip.
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import { PALETTE } from '../../core/palette';

/** Rim vertices per pool. 14 is round enough at 384x216 and cheap. */
const RIM = 14;
/** Pool half-extent along the wall, and out from it. */
const ALONG = 2.1;
const OUT = 3.4;
/** Brightness at the sill. Additive: keep it low, or the snow under a window blows out to cream. */
const STRENGTH = 0.5;
const LIFT = 0.06;

/**
 * Pools for one house. `house` must already be positioned and rotated; its local +z is the front
 * wall at `depth / 2`, which is where `house()` in landmarks.ts puts its windows.
 */
export function windowPools(
  sampler: TerrainSampler,
  house: THREE.Object3D,
  width: number,
  depth: number,
  windows: number,
): THREE.Mesh {
  house.updateMatrix();
  const lamp = new THREE.Color(PALETTE.LANTERN);
  const pos: number[] = [];
  const col: number[] = [];
  const local = new THREE.Vector3();

  const put = (lx: number, lz: number, a: number): void => {
    local.set(lx, 0, lz).applyMatrix4(house.matrix);
    // Stored relative to the house's own anchor, so the pool stands where the house stands.
    const o = house.position;
    pos.push(local.x - o.x, sampler.heightAt(local.x, local.z) + LIFT - o.y, local.z - o.z);
    col.push(lamp.r * a, lamp.g * a, lamp.b * a);
  };

  for (let i = 0; i < windows; i++) {
    // Same window placement as house(), so the pool sits under the glass, not beside it.
    const wx = windows === 1 ? width * 0.28 : -width * 0.28 + (width * 0.56 * i) / (windows - 1);
    const z0 = depth / 2 + 0.1;
    // A half-ellipse fan: centre at the wall, rim out into the square.
    for (let k = 0; k < RIM; k++) {
      const t0 = Math.PI * (k / RIM);
      const t1 = Math.PI * ((k + 1) / RIM);
      put(wx, z0 + 0.3, STRENGTH);
      put(wx + Math.cos(t1) * ALONG, z0 + Math.sin(t1) * OUT, 0);
      put(wx + Math.cos(t0) * ALONG, z0 + Math.sin(t0) * OUT, 0);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // A3: light, not geometry — keep it out of the normal pass so it draws no outline.
  material.allowOverride = false;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'window-light';
  mesh.renderOrder = 1;
  mesh.position.copy(house.position);
  return mesh;
}
