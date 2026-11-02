/**
 * The valley as geometry: one non-indexed, vertex-coloured, textured THREE.Mesh.
 *
 * The grid is the heightfield's own (192 vertices per side, 72,962 triangles, ~5.4 units a side) and
 * each cell is split along its lower diagonal, so the drawn ground never stands above the ground Pip
 * walks on (groundHeight.ts). A coarser grid of its own buried him at the foot of the ridge spikes.
 * Shading used to be per face — one normal and one colour per triangle, plus a per-triangle tone
 * jitter — and at 384x216 that drew the valley floor as a mosaic of huge flat triangles.
 * Now every vertex carries the sampler's own normal and colour at that point and the faces between
 * them are smooth, so the ground reads as rolling snow; form comes from the light, the cast shadows
 * and the authored textures. Props and buildings stay flat-shaded: they are the chunky part.
 *
 * Every face is still filed into one of three geometry groups — snow, rock, ice — because each gets
 * its own authored ground texture (groundTexture.ts); the colour logic is groundColour.ts. UVs are
 * derived from world position, so the texel grid is continuous across faces and never stretches.
 *
 * Nothing here decides where anything goes — positions, heights, colours all come from the sampler
 * and the palette. This module only tessellates, colours and textures.
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import { groundOnly } from '../../core/terrain/heightfield';
import { GROUND_TILE_WORLD } from './groundTexture';
import { groundColour, surfaceClassOf } from './groundColour';
import { MESH_RES, splitsAntiDiagonal } from './groundHeight';
import { groundDevSeam, SURFACE_ORDER, terrainMaterials, type TerrainSurfaceClass } from './terrainMaterial';

/** One group's worth of buffers, accumulated per surface class. */
interface Bucket {
  pos: number[];
  nrm: number[];
  col: number[];
  uv: number[];
}

const emptyBucket = (): Bucket => ({ pos: [], nrm: [], col: [], uv: [] });

/** Scratch colour used to convert palette sRGB into the renderer's linear working space. */
const scratch = new THREE.Color();

/**
 * Tessellate the sampler into a smooth-shaded mesh. Caller owns the returned object; this adds
 * nothing to any scene.
 */
export function buildTerrainMesh(valley: TerrainSampler): THREE.Mesh {
  // The ground itself: a bridge deck is drawn as planks (tuckBridge.ts), not as a ridge of snow.
  const sampler = groundOnly(valley);
  const res = MESH_RES;
  const cell = sampler.size / (res - 1);
  const half = sampler.size / 2;

  const buckets = new Map<TerrainSurfaceClass, Bucket>(SURFACE_ORDER.map((k) => [k, emptyBucket()]));

  // Height, normal and colour are sampled once per vertex and shared by the faces that touch it.
  const heights = new Float32Array(res * res);
  const normals = new Float32Array(res * res * 3);
  const colours = new Float32Array(res * res * 3);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) heights[j * res + i] = sampler.heightAt(-half + i * cell, -half + j * cell);
  }
  for (let j = 0; j < res; j++) {
    const z = -half + j * cell;
    for (let i = 0; i < res; i++) {
      const x = -half + i * cell;
      const k = j * res + i;
      const sample = sampler.sampleAt(x, z);
      const n = sampler.normalAt(x, z);
      normals.set([n.x, n.y, n.z], k * 3);
      // Coloured by the faces the vertex is drawn with, not only by the slope at its own point: at the
      // foot of a V or the lip of a cliff the point is flat while every face round it is a wall, and
      // the wall drew as snow. Stone shows on a face as steep as the ground the faces actually make.
      const steep = Math.max(sample.slope, cellSlope(heights, res, cell, i, j));
      const c = groundColour({ ...sample, slope: steep, surface: steep > 0.6 ? 'rock' : sample.surface }, x, z);
      // A faint per-vertex tone, so a wide plain is not one flat value. Interpolated across the
      // faces it reads as soft mottling, never as a triangle edge.
      const jitter = (((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) + 1) % 1;
      const tone = 0.96 + jitter * 0.08;
      scratch.setRGB(Math.min(1, c.r * tone), Math.min(1, c.g * tone), Math.min(1, c.b * (0.98 + jitter * 0.04)), THREE.SRGBColorSpace);
      colours.set([scratch.r, scratch.g, scratch.b], k * 3);
    }
  }

  const face = (a: number, b: number, c: number): void => {
    const ax = -half + (a % res) * cell, az = -half + Math.floor(a / res) * cell;
    const bx = -half + (b % res) * cell, bz = -half + Math.floor(b / res) * cell;
    const cx = -half + (c % res) * cell, cz = -half + Math.floor(c / res) * cell;
    const surface = surfaceClassOf(sampler.sampleAt((ax + bx + cx) / 3, (az + bz + cz) / 3));
    const bucket = buckets.get(surface) as Bucket;
    bucket.pos.push(ax, heights[a], az, bx, heights[b], bz, cx, heights[c], cz);
    for (const v of [a, b, c]) {
      bucket.nrm.push(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]);
      bucket.col.push(colours[v * 3], colours[v * 3 + 1], colours[v * 3 + 2]);
    }
    // The texel grid, in world space, so the pattern is continuous across faces. Seen from above on
    // the ground; on a rock wall, from the side, so the strata in the rock map lie level across the
    // face instead of being smeared top to bottom into streaks by a map laid on from overhead.
    const wall = surface === 'rock' ? wallAxis(ax, heights[a], az, bx, heights[b], bz, cx, heights[c], cz) : null;
    for (const [x, y, z] of [[ax, heights[a], az], [bx, heights[b], bz], [cx, heights[c], cz]]) {
      if (wall) bucket.uv.push((x * wall[0] + z * wall[1]) / GROUND_TILE_WORLD, y / GROUND_TILE_WORLD);
      else bucket.uv.push(x / GROUND_TILE_WORLD, z / GROUND_TILE_WORLD);
    }
  };

  for (let j = 0; j < res - 1; j++) {
    for (let i = 0; i < res - 1; i++) {
      const v00 = j * res + i;
      const v10 = v00 + 1;
      const v01 = v00 + res;
      const v11 = v01 + 1;
      // Counter-clockwise seen from above, so the front face is the walkable one; split along the
      // lower diagonal (groundHeight.ts).
      if (splitsAntiDiagonal(heights[v00], heights[v10], heights[v01], heights[v11])) {
        face(v00, v01, v10);
        face(v10, v01, v11);
      } else {
        face(v00, v01, v11);
        face(v00, v11, v10);
      }
    }
  }

  // Concatenate the buckets into one buffer, remembering each group's vertex range.
  const total = SURFACE_ORDER.reduce((n, k) => n + (buckets.get(k) as Bucket).pos.length, 0);
  const positions = new Float32Array(total);
  const normalBuf = new Float32Array(total);
  const colourBuf = new Float32Array(total);
  const uvs = new Float32Array((total / 3) * 2);

  const geometry = new THREE.BufferGeometry();
  // Two running offsets: the buffers are indexed in floats (3 per vertex, 2 per uv) while
  // `addGroup` counts vertices. Mixing the two made group 2 start past the end of the buffer and
  // the valley rendered as sky — invisible to every unit test, obvious in a frame.
  let floatAt = 0;
  let uvAt = 0;
  let vertexAt = 0;
  SURFACE_ORDER.forEach((key, index) => {
    const b = buckets.get(key) as Bucket;
    if (b.pos.length === 0) return;
    positions.set(b.pos, floatAt);
    normalBuf.set(b.nrm, floatAt);
    colourBuf.set(b.col, floatAt);
    uvs.set(b.uv, uvAt);
    geometry.addGroup(vertexAt, b.pos.length / 3, index);
    floatAt += b.pos.length;
    uvAt += b.uv.length;
    vertexAt += b.pos.length / 3;
  });

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normalBuf, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colourBuf, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, terrainMaterials());
  mesh.name = 'terrain';
  groundDevSeam()?.meshes.push(mesh);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

/** For a face steeper than about 50 degrees, the level direction across it; null for anything gentler. */
function wallAxis(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): [number, number] | null {
  const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  const flat = Math.hypot(nx, nz);
  if (Math.abs(ny) > flat * 0.85) return null;
  return [-nz / flat, nx / flat];
}

/** Mean slope (1 - normal.y) of the up-to-four grid cells that share vertex (i, j). */
function cellSlope(h: Float32Array, res: number, cell: number, i: number, j: number): number {
  let sum = 0;
  let n = 0;
  for (const [ci, cj] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
    if (ci < 0 || cj < 0 || ci >= res - 1 || cj >= res - 1) continue;
    const k = cj * res + ci;
    const gx = (h[k + 1] + h[k + res + 1] - h[k] - h[k + res]) / (2 * cell);
    const gz = (h[k + res] + h[k + res + 1] - h[k] - h[k + 1]) / (2 * cell);
    sum += 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz);
    n++;
  }
  return n ? sum / n : 0;
}

/** Exposed for the story: the tessellation the shipped mesh uses, in triangles. */
export const TERRAIN_TRIANGLES = (MESH_RES - 1) * (MESH_RES - 1) * 2;
