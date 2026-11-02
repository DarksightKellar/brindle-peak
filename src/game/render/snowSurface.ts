/**
 * The snow's surface: wind ripples, drifts, sun glints, and the lake's cracks, frost and polish.
 *
 * Why: the ground's authored tiles (world/groundTexture.ts) are 48 units across and mip-filtered, so
 * past a few metres they average to one value, and the 2.6x grade then turns that value into a flat
 * blue fill. Mid-ground snowfields, slopes and the lake read as untextured plastic (critic round 3,
 * Kettle Springs, the Frozen Reach, the plain below the hamlet). The lake was worse: its colour is
 * one value per triangle, so it showed the mesh as big flat triangles.
 *
 * What: a shader patch on the terrain's snow and ice materials and on the lake sheet (GLSL in
 * snowSurfaceShader.ts). The world's materials, colours and geometry are untouched; this finds them
 * in the scene by name once and adds to their shaders. Every feature is anchored to world position
 * and sized by the pixel footprint, so it holds still when the camera moves and has a scale that
 * draws at every distance. Rock is left alone (the world owns its bands).
 */
import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { SNOW_ALBEDO, SNOW_NORMAL, SNOW_PARS, SNOW_SPARKLE, SNOW_VERTEX } from './snowSurfaceShader';

/**
 * Strengths: wind marks and ripples, drift tone step (0.4 = drifts 20 % whiter or bluer), sun
 * glints, ice detail. Tuned from the four comparison spots, day and dusk.
 */
export const SNOW_LOOK = { marks: 1, drifts: 0.4, sparkle: 1, ice: 1 } as const;
/** Glints at full dusk, as a share of day: the low sun still catches a few. */
const DUSK_SPARKLE = 0.45;
/** The wind's bearing, 35 degrees off the sun's, so the low sun lights the ripples' long windward
 *  faces and leaves their lee lines blue. Marks lie across it. */
const WIND_ANGLE = 5.67;

const lin = (hex: string): THREE.Color => new THREE.Color(hex);
const uniforms = {
  uSnowSun: { value: new THREE.Vector3(0, 1, 0) },
  uSnowLook: { value: new THREE.Vector4(SNOW_LOOK.marks, SNOW_LOOK.drifts, SNOW_LOOK.sparkle, SNOW_LOOK.ice) },
  uSnowWind: { value: new THREE.Vector2(Math.cos(WIND_ANGLE), Math.sin(WIND_ANGLE)) },
  uIceDisc: { value: new THREE.Vector4(0, 0, 0, -1e3) },
  uIceDeep: { value: lin(PALETTE.ICE_DEEP) },
  uIceMid: { value: lin(PALETTE.ICE_MID) },
  uIceHi: { value: lin(PALETTE.ICE_HI) },
  uIceFrost: { value: lin(PALETTE.SNOW_LT) },
};

/** 0 = snow, 1 = terrain ice, 2 = the lake sheet (which also replaces its mosaic colours). */
type Kind = 0 | 1 | 2;

function patch(material: THREE.Material, kind: Kind): void {
  if (material.userData.snowSurface) return;
  material.userData.snowSurface = true;
  const before = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSnowWorld;')
      .replace('#include <project_vertex>', SNOW_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#define SNOW_KIND ${kind}\n${SNOW_PARS}`)
      .replace('#include <color_fragment>', SNOW_ALBEDO)
      .replace('#include <normal_fragment_maps>', SNOW_NORMAL)
      .replace('#include <opaque_fragment>', kind === 1 ? '#include <opaque_fragment>' : SNOW_SPARKLE);
  };
  // three keys programs by material parameters; the snow, rock and lake materials share all of them.
  material.customProgramCacheKey = () => `${key()}|snow-surface-${kind}`;
  material.needsUpdate = true;
}

/** The lake sheet's centre, radius and height, read from its geometry (the rim ring is 5 % wider). */
function measureLake(mesh: THREE.Mesh): void {
  const box = (mesh.geometry.boundingBox ?? (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox)) as THREE.Box3;
  const r = (box.max.x - box.min.x) / 2 / 1.05;
  uniforms.uIceDisc.value.set((box.max.x + box.min.x) / 2, (box.max.z + box.min.z) / 2, r, box.min.y);
}

export interface SnowSurface {
  /** Once per frame: attaches to the ground the first time it is in the scene, then follows the light. */
  update(scene: THREE.Scene, sun: THREE.Vector3, dusk: number): void;
}

export function createSnowSurface(): SnowSurface {
  let attached = false;
  // Dev seam for A/B from the same pose: set `look` (x marks, y drifts, w ice) and `tune.sparkle` live.
  const tune = { sparkle: SNOW_LOOK.sparkle as number };
  if (import.meta.env.DEV) {
    (window as unknown as { __snowSurface?: unknown }).__snowSurface = { look: uniforms.uSnowLook.value, tune };
  }
  return {
    update(scene, sun, dusk): void {
      if (!attached) {
        const terrain = scene.getObjectByName('terrain') as THREE.Mesh | undefined;
        const lake = scene.getObjectByName('frozen-reach') as THREE.Mesh | undefined;
        if (terrain) {
          for (const m of ([] as THREE.Material[]).concat(terrain.material)) {
            if (m.userData.surface === 'snow') patch(m, 0);
            else if (m.userData.surface === 'ice') patch(m, 1);
          }
          if (lake) {
            measureLake(lake);
            patch(lake.material as THREE.Material, 2);
          }
          attached = true;
        }
      }
      uniforms.uSnowSun.value.copy(sun);
      uniforms.uSnowLook.value.z = tune.sparkle * (1 - dusk * (1 - DUSK_SPARKLE));
    },
  };
}
