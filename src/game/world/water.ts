/**
 * Water: the Frozen Reach ice sheet and the five spring pools. Their steam is steam.ts.
 *
 * The ice sits 0.02 above the lake's flattened terrain and is drawn with a polygon offset, so it
 * can never z-fight with the shore. It is opaque and lit like any other surface, which keeps it in
 * the normal pass where it belongs; everything unlit here (the pool discs)
 * sets `allowOverride = false` per ART_BIBLE A3 so it cannot poison the outline pass.
 *
 * `updateWater` touches one uniform. The shimmer is a vertex-colour modulation in the Lambert
 * shader, not per-frame CPU work.
 */
import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import { smoothstep } from '../../core/contracts';
import { fbm2D } from '../../core/math/noise';
import { PALETTE } from '../../core/palette';
import { ZONES } from '../../data/zones';
import { SPRING_POOLS } from './landmarks';
import { groundTiles } from './groundTexture';
import { finish, lin, tri, upTri } from './waterMesh';
import { groundDevSeam } from './terrainMaterial';

const LAKE_Y = 2.02;
const RINGS = 12;
const SEGMENTS = 48;
const POOL_SEGMENTS = 20;

const shimmer = { value: 0 };
let clock = 0;

/**
 * Where the ice actually meets land: the terrain is flattened to LAKE_HEIGHT inside 74% of the
 * reach radius and climbs back out by 106%, so the visible shore is somewhere in between. Walking
 * rays out to the first sample above the ice finds it, and the disc is built to just inside the
 * nearest crossing so no ice is ever buried under a bank.
 *
 * "Above the ice" means any rise off the flat at all, on 64 rays a half-step apart. Waiting for the
 * bank to clear the sheet by 5 cm put the rim a couple of units up the first gentle rise, and the
 * snow there poked up through the ice in a ring of slivers.
 */
function shoreline(sampler: TerrainSampler): { x: number; z: number; r: number } {
  const reach = ZONES.find((z) => z.id === 'reach');
  if (!reach) return { x: 0, z: 0, r: 0 };
  let nearest = reach.radius;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    for (let d = reach.radius * 0.5; d < reach.radius * 1.1; d += 0.5) {
      const h = sampler.heightAt(reach.centre.x + Math.cos(a) * d, reach.centre.z + Math.sin(a) * d);
      if (h > LAKE_Y - 0.015) {
        nearest = Math.min(nearest, d);
        break;
      }
    }
  }
  return { x: reach.centre.x, z: reach.centre.z, r: Math.max(40, nearest - 2) };
}

export interface Mesh3 {
  pos: number[];
  col: number[];
  /** World-derived UVs. Only the ice sheet uses them; the pools and steam ignore the attribute. */
  uv: number[];
}

export /**
 * One disc, mottled with value noise and brightening toward the shore, plus a raised rim ring.
 * Built in world space: the lake has exactly one position.
 */
function buildIce(sampler: TerrainSampler): THREE.Mesh {
  const { x: cx, z: cz, r } = shoreline(sampler);
  const mottle = fbm2D(0x1ce5, 3, 2.13, 0.5);
  const iceHi = lin('ICE_HI');
  const iceMid = lin('ICE_MID');
  const iceDeep = lin('ICE_DEEP');
  const snowLt = lin('SNOW_LT');
  const k = new THREE.Color();
  const m: Mesh3 = { pos: [], col: [], uv: [] };

  for (let ring = 0; ring < RINGS; ring++) {
    const r0 = (r * ring) / RINGS;
    const r1 = (r * (ring + 1)) / RINGS;
    for (let s = 0; s < SEGMENTS; s++) {
      const a0 = (s / SEGMENTS) * Math.PI * 2;
      const a1 = ((s + 1) / SEGMENTS) * Math.PI * 2;
      const p = [
        [cx + Math.cos(a0) * r0, LAKE_Y, cz + Math.sin(a0) * r0],
        [cx + Math.cos(a1) * r0, LAKE_Y, cz + Math.sin(a1) * r0],
        [cx + Math.cos(a1) * r1, LAKE_Y, cz + Math.sin(a1) * r1],
        [cx + Math.cos(a0) * r1, LAKE_Y, cz + Math.sin(a0) * r1],
      ];
      for (let i = 0; i < 2; i++) {
        const a = p[i];
        const b = p[i + 1];
        const c = p[i + 2];
        const mx = (a[0] + b[0] + c[0]) / 3;
        const mz = (a[2] + b[2] + c[2]) / 3;
        const dist = Math.hypot(mx - cx, mz - cz) / (r || 1);
        const grain = 0.5 + 0.5 * mottle(mx / 44, mz / 44);
        k.copy(iceDeep).lerp(iceMid, grain).lerp(iceHi, smoothstep(0.7, 1, dist) * 0.8);
        tri(m, a, b, c, k);
      }
    }
  }

  // Shoreline lip: a raised ring that reads as the edge of the ice where terrain climbs out of it.
  for (let s = 0; s < SEGMENTS; s++) {
    const a0 = (s / SEGMENTS) * Math.PI * 2;
    const a1 = ((s + 1) / SEGMENTS) * Math.PI * 2;
    const i0 = [cx + Math.cos(a0) * r, LAKE_Y, cz + Math.sin(a0) * r];
    const i1 = [cx + Math.cos(a1) * r, LAKE_Y, cz + Math.sin(a1) * r];
    const o0 = [cx + Math.cos(a0) * r * 1.05, LAKE_Y + 0.1, cz + Math.sin(a0) * r * 1.05];
    const o1 = [cx + Math.cos(a1) * r * 1.05, LAKE_Y + 0.1, cz + Math.sin(a1) * r * 1.05];
    tri(m, i0, i1, o1, iceHi);
    tri(m, i0, o1, o0, snowLt);
  }

  // Pressure ridges: a frozen lake is not a mirror. Low tents give the ice a readable surface.
  const ridge = lin('ICE_HI');
  for (let i = 0; i < 14; i++) {
    const a = i * 2.399;
    const d = r * (0.18 + 0.66 * (((i * 37) % 11) / 11));
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    const yaw = a * 1.7;
    const len = 4 + ((i * 53) % 7);
    const h = 0.3 + ((i * 29) % 5) * 0.1;
    const ux = Math.cos(yaw) * len, uz = -Math.sin(yaw) * len;
    const vx = Math.sin(yaw) * 1.2, vz = Math.cos(yaw) * 1.2;
    const y = LAKE_Y + 0.01;
    const p0 = [x - ux + vx, y, z - uz + vz], p1 = [x + ux + vx, y, z + uz + vz];
    const p2 = [x + ux - vx, y, z + uz - vz], p3 = [x - ux - vx, y, z - uz - vz];
    const r0 = [x - ux, y + h, z - uz], r1 = [x + ux, y + h, z + uz];
    upTri(m, p0, p1, r1, ridge); upTri(m, p0, r1, r0, ridge);
    upTri(m, p2, p3, r0, ridge); upTri(m, p2, r0, r1, ridge);
    upTri(m, p1, p2, r1, ridge); upTri(m, p3, p0, r0, ridge);
  }

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    /*
     * The lake is the largest flat surface in the game and it was a single mottled vertex colour:
     * at 384x216 it read as a blue floor. The terrain's ice tile supplies the crack network; the
     * UVs above are world-derived, so the cracks never stretch as the disc's polar grid narrows
     * toward the centre.
     */
    map: groundTiles().ice.texture,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // three's program cache key is built from material *parameters*, not from the shader the hooks
  // produce, and the lake shares vertexColors+map+Lambert with the terrain's ice material. Without a
  // family tag of its own the two would share one compiled program and one of the two patches
  // (shimmer here, the light ramp in assemble) would silently vanish.
  material.customProgramCacheKey = () => 'water-shimmer';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uShimmer = shimmer;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uShimmer;')
      .replace(
        '#include <color_vertex>',
        '#include <color_vertex>\nvColor.rgb *= 1.0 + 0.05 * sin(uShimmer + position.x * 0.31 + position.z * 0.23);',
      );
  };
  // Same dev-only seam as the terrain: a harness needs the live material to toggle its map while
  // the camera and clock are frozen (see docs/ART_PASS.md).
  groundDevSeam()?.iceMaterials.push(material);
  return finish(m, 'frozen-reach', material);
}

/**
 * Five hot pools, one geometry, one unlit material, so they still glow after dark. Milky turquoise,
 * deeper in the middle: they used to be amber, and after the grade an amber disc on snow read as a
 * flat orange plate rather than water. The warmth at the springs is the steam and the thawed stone.
 */
function buildPools(sampler: TerrainSampler): THREE.Mesh {
  const depth = lin('WATER_DEEP').lerp(lin('ICE_MID'), 0.45);
  const milk = lin('ICE_MID').lerp(lin('WATER_FOAM'), 0.3);
  const m: Mesh3 = { pos: [], col: [], uv: [] };

  for (const pool of SPRING_POOLS) {
    const y = sampler.heightAt(pool.x, pool.z) + 0.06;
    const centre = [pool.x, y, pool.z];
    const ring = (a: number, k: number): number[] => [pool.x + Math.cos(a) * pool.r * k, y, pool.z + Math.sin(a) * pool.r * k];
    for (let s = 0; s < POOL_SEGMENTS; s++) {
      const a0 = (s / POOL_SEGMENTS) * Math.PI * 2;
      const a1 = ((s + 1) / POOL_SEGMENTS) * Math.PI * 2;
      tri(m, centre, ring(a0, 0.55), ring(a1, 0.55), depth);
      tri(m, ring(a0, 0.55), ring(a0, 1), ring(a1, 1), milk);
      tri(m, ring(a0, 0.55), ring(a1, 1), ring(a1, 0.55), milk);
    }
  }

  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.allowOverride = false;
  return finish(m, 'spring-pools', material);
}

export function buildWater(sampler: TerrainSampler): THREE.Group {
  const group = new THREE.Group();
  group.name = 'water';
  group.add(buildIce(sampler), buildPools(sampler));
  return group;
}

/** Advances the ice shimmer. One uniform write per frame; nothing is rebuilt or re-uploaded. */
export function updateWater(dt: number): void {
  clock += dt;
  shimmer.value = clock * 0.6;
}

/** The ice plane's height, exported so gameplay can test "on the lake" without re-deriving it. */
export const ICE_SURFACE_Y = LAKE_Y;
/** Palette sanity: the lake is the only place ICE_MID appears as a large flat field. */
export const ICE_TINT = PALETTE.ICE_MID;
