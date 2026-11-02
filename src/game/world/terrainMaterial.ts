/**
 * The terrain's three materials: snow, rock, ice.
 *
 * One material cannot serve all three surfaces because the authored map is per-surface (wind
 * ripples are wrong on a cliff, ice cracks are wrong on a drift). So the mesh is split into three
 * geometry groups by surface and given three materials, all built from the same recipe so lighting,
 * shading mode and shadow behaviour stay identical. Three draw calls for the whole valley floor is
 * still nothing.
 *
 * Each material keeps `vertexColors: true`: the map is a *modulation* of the per-face palette
 * colour, never a replacement for it. The biome colour logic stays exactly where it was.
 */

import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { groundTiles } from './groundTexture';

export type TerrainSurfaceClass = 'snow' | 'rock' | 'ice';

/** Group index in the terrain geometry; the order materials are added must match. */
export const SURFACE_ORDER: readonly TerrainSurfaceClass[] = ['snow', 'rock', 'ice'];

const cache = new Map<TerrainSurfaceClass, THREE.MeshLambertMaterial>();

export function terrainMaterial(key: TerrainSurfaceClass): THREE.MeshLambertMaterial {
  const hit = cache.get(key);
  if (hit) return hit;

  const tiles = groundTiles();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    // Base tint is the palette's whitest snow, so the terrain can never leave the snow family.
    color: PALETTE.SNOW_HI,
    map: tiles[key].texture,
  });
  // Proof-of-wiring seam. Set from a harness (`m.map = m.userData.checker`) to render a loud
  // magenta/green checker through the same UV path the authored map uses: a wired map that renders
  // nothing and a map that was never attached are otherwise indistinguishable.
  material.userData.checker = tiles.checker;
  material.userData.surface = key;
  cache.set(key, material);
  return material;
}

/** All three, in group order. */
export function terrainMaterials(): THREE.MeshLambertMaterial[] {
  return SURFACE_ORDER.map(terrainMaterial);
}

/**
 * Harness seam, dev builds only.
 *
 * Proving that a map reaches the shader needs the live material toggled while the camera and the
 * weather clock are held still, which means calling `pipeline.render()` directly between two
 * captures. `__game` exposes neither the scene nor the world, and widening that surface belongs to
 * another agent, so the ground publishes itself here instead. `import.meta.env.DEV` is false in a
 * build, so nothing of this reaches the player.
 */
export interface GroundDevSeam {
  materials: () => THREE.MeshLambertMaterial[];
  meshes: THREE.Mesh[];
  iceMaterials: THREE.MeshLambertMaterial[];
}

const seam: GroundDevSeam | null =
  import.meta.env.DEV && typeof window !== 'undefined'
    ? ((window as unknown as { __ground?: GroundDevSeam }).__ground ??= {
        materials: terrainMaterials,
        meshes: [],
        iceMaterials: [],
      })
    : null;

/** Null in a production build. Callers must not depend on it for anything but diagnostics. */
export function groundDevSeam(): GroundDevSeam | null {
  return seam;
}
