/**
 * Buildings, as the camera sees them: solid blocks it rises over, the same way it rises over a bank.
 *
 * Walking past the west side of Nana's cabin put the chase camera inside the cabin, so the frame was
 * the inside of its walls. Props fade (render/viewFade.ts), but a whole house cannot fade without the
 * house disappearing. Treated as raised ground, the camera steps up and looks over the roof instead.
 *
 * The player's box colliders already give each building's footprint; the height is read once from the
 * meshes standing in that footprint. The radio mast is left out: it is an open lattice, seen through.
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';

export interface Structure {
  x: number;
  z: number;
  hw: number;
  hd: number;
  yaw: number;
  /** World height of the roof's highest point. */
  top: number;
}

/** Lower than this is a wall or a slab: the terrain margin already covers it. */
const MIN_HEIGHT = 3;
/** Footprints are trimmed for the walk (the eaves overhang); the camera keeps clear of the eaves too. */
const MARGIN = 0.8;

export function measureStructures(
  root: THREE.Object3D, colliders: readonly Collider[], skip: (x: number, z: number) => boolean,
): Structure[] {
  const meshes: THREE.Box3[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    if (!b.isEmpty()) meshes.push(b);
  });
  const out: Structure[] = [];
  for (const c of colliders) {
    if (c.kind !== 'box' || skip(c.x, c.z)) continue;
    let top = -Infinity;
    let base = Infinity;
    for (const b of meshes) {
      const inside = c.x > b.min.x && c.x < b.max.x && c.z > b.min.z && c.z < b.max.z;
      if (!inside || b.max.x - b.min.x > 40 || b.max.z - b.min.z > 40) continue; // not the terrain
      top = Math.max(top, b.max.y);
      base = Math.min(base, b.min.y);
    }
    if (top - base < MIN_HEIGHT) continue;
    out.push({ x: c.x, z: c.z, hw: c.hw + MARGIN, hd: c.hd + MARGIN, yaw: c.yaw, top });
  }
  return out;
}

export type Ground = Pick<TerrainSampler, 'heightAt'>;

/** The terrain with every structure standing on it, for the camera's clearance checks only. */
export function withStructures(terrain: Ground, list: readonly Structure[]): Ground {
  if (list.length === 0) return terrain;
  return {
    heightAt(x: number, z: number): number {
      let h = terrain.heightAt(x, z);
      for (const s of list) {
        const dx = x - s.x;
        const dz = z - s.z;
        const c = Math.cos(s.yaw);
        const n = Math.sin(s.yaw);
        if (Math.abs(dx * c - dz * n) <= s.hw && Math.abs(dx * n + dz * c) <= s.hd) h = Math.max(h, s.top);
      }
      return h;
    },
  };
}
