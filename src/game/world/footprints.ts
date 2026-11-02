/**
 * Footprints — GDD v1.1 R8, "your trail is the map".
 *
 * The snow remembers you: a fading trail lets a player retrace a route out of a wood, read where
 * an animal went, and infer the shape of ground they have already covered. It is also genuinely
 * winter-native — the reference game could not have done it.
 *
 * Implementation is a fixed ring buffer of 96 ground-hugging marks with a per-vertex RGBA colour
 * that we rewrite each frame to fade. One draw call, no per-frame allocation, no shader changes:
 * the fade is done in the colour attribute rather than in a uniform so each print ages
 * independently.
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import { paletteRgb } from '../../core/palette';

export const FOOTPRINT_LIFE = 90;
/** World units of travel between prints. Two per stride feels like walking, not sliding. */
export const FOOTPRINT_SPACING = 0.62;
const MAX = 96;
/*
 * Print shape: a small pointed mark, toe forward, about a fifth of Pip's height.
 *
 * Prints used to be 0.92-unit squares laid every 0.62 units only 0.16 off the centre line, so each
 * one overlapped the last and the trail read as one wide translucent ribbon (playtest). A print has
 * to be smaller than the gap between prints, or there are no prints, only a band. At chase distance
 * this is ~6x9 internal pixels beside the bird, shrinking to a dotted pair of lines up the trail.
 */
const HALF_W = 0.12;
const TOE = 0.23;
const HEEL = 0.14;
/** Lateral offset of each foot from the centre line: wide enough that the two rows read apart. */
const STRIDE = 0.2;
/** Darker than the old band, because a small mark needs more contrast to be seen at all. */
const BASE_OPACITY = 0.72;
/** Above the ground enough to beat z-fighting on flat-shaded terrain, below enough to look laid. */
const LIFT = 0.05;

/** Normalised life remaining, 1 at birth down to 0 at expiry. Pure, so it is testable. */
export function footprintAlpha(ageSec: number): number {
  if (ageSec <= 0) return 1;
  if (ageSec >= FOOTPRINT_LIFE) return 0;
  return 1 - ageSec / FOOTPRINT_LIFE;
}

/** Footprints belong on snow and ice. Rock and hot springs do not hold them. */
export function holdsFootprints(surface: string): boolean {
  return surface !== 'rock' && surface !== 'spring';
}

/**
 * Walks behind the player and decides when to lay a print. Kept here rather than in the session so
 * the stride logic and the fade logic live together, and the session gains one call instead of four
 * fields.
 */
export interface FootprintTracker {
  follow(player: { pos: { x: number; z: number }; facing: number; grounded: boolean }, dt: number): void;
}

export function createFootprintTracker(
  prints: Footprints,
  sampler: TerrainSampler,
  start: { x: number; z: number },
): FootprintTracker {
  let lastX = start.x;
  let lastZ = start.z;
  let side = 1;
  return {
    follow(player, dt): void {
      if (player.grounded) {
        const moved = Math.hypot(player.pos.x - lastX, player.pos.z - lastZ);
        if (moved >= FOOTPRINT_SPACING) {
          prints.stamp(sampler, player.pos.x, player.pos.z, side, player.facing);
          side = -side;
          // Advance the anchor even when the surface refused the print, or a walk across rock
          // would retry every frame and leave a burst of prints at the first patch of snow.
          lastX = player.pos.x;
          lastZ = player.pos.z;
        }
      }
      prints.update(dt);
    },
  };
}

export interface Footprints {
  readonly object: THREE.Object3D;
  /** Lay a print at the player's feet. Alternates left/right using `side`. */
  stamp(sampler: TerrainSampler, x: number, z: number, side: number, facing: number): void;
  update(dt: number): void;
  setEnabled(on: boolean): void;
  /** Number of live (unexpired) prints. Exposed for the verification harness. */
  count(): number;
  dispose(): void;
}

export function createFootprints(): Footprints {
  const positions = new Float32Array(MAX * 6 * 3);
  const colours = new Float32Array(MAX * 6 * 4);
  const ages = new Float32Array(MAX).fill(Infinity);

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const colAttr = new THREE.BufferAttribute(colours, 4);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  colAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('color', colAttr);

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
    // DoubleSide is required, not defensive: the quads are laid in a Y-up plane and the corner
    // order winds clockwise as seen from above, so FrontSide culls every print from a camera that
    // is looking down at the ground. This was invisible in code review and obvious on screen.
    side: THREE.DoubleSide,
  });
  // A3: this must not be swallowed by the normal pass, or it injects edge noise.
  material.allowOverride = false;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.name = 'footprints';

  /*
   * Print colour, per surface, and it settles.
   *
   * Every print used to be SHADOW_FLOOR (#1E2A44), a dark navy: correct on snow, where a footprint is
   * a cool hollow, and badly wrong on the brown path down in the Reach, where it read as blue paint on
   * sand (reported from play). A print now starts cool and shifts to the colour of the ground it was
   * pressed into over its first second, so the newest couple of steps still read as freshly disturbed
   * and everything behind them belongs to the surface.
   */
  const COOL = paletteRgb('SHADOW_FLOOR');
  const EARTH = paletteRgb('BARK');
  const SETTLE_SECONDS = 1.1;
  const tints: Array<{ r: number; g: number; b: number }> = new Array(MAX);
  for (let i = 0; i < MAX; i++) tints[i] = { ...COOL };
  // The hamlet's 'path' is trodden snow now (terrainMesh.ts), so only bare wood keeps an earth print.
  const surfaceTint = (surface: string): { r: number; g: number; b: number } =>
    surface === 'wood' ? { ...EARTH } : { ...COOL };
  const tilt = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  // Two triangles making a kite: heel, side, toe / heel, toe, other side. Local +z is forward.
  const corners: Array<[number, number]> = [
    [0, -HEEL],
    [HALF_W, 0],
    [0, TOE],
    [0, -HEEL],
    [0, TOE],
    [-HALF_W, 0],
  ];

  let cursor = 0;
  let enabled = true;

  const writeColour = (index: number, alpha: number): void => {
    const tint = tints[index] ?? COOL;
    const age = ages[index];
    // 0 when fresh (cool), 1 once settled (the ground's own colour).
    const settle = Number.isFinite(age as number)
      ? Math.min(1, (age as number) / SETTLE_SECONDS) : 1;
    const r = COOL.r + (tint.r - COOL.r) * settle;
    const g = COOL.g + (tint.g - COOL.g) * settle;
    const b = COOL.b + (tint.b - COOL.b) * settle;
    const base = index * 6 * 4;
    for (let v = 0; v < 6; v++) {
      const o = base + v * 4;
      colours[o] = r;
      colours[o + 1] = g;
      colours[o + 2] = b;
      colours[o + 3] = alpha;
    }
  };

  // Start fully transparent so nothing flashes at the origin before the first stamp.
  for (let i = 0; i < MAX; i++) writeColour(i, 0);

  return {
    object: mesh,

    stamp(sampler, x, z, side, facing): void {
      if (!enabled) return;
      const sample = sampler.sampleAt(x, z);
      if (!holdsFootprints(sample.surface)) return;

      const n = sampler.normalAt(x, z);
      normal.set(n.x, n.y, n.z).normalize();
      tilt.quaternion.setFromUnitVectors(up, normal);
      tilt.rotateY(facing);

      // Offset across the direction of travel so the prints alternate left and right.
      const offX = Math.cos(facing) * STRIDE * side;
      const offZ = -Math.sin(facing) * STRIDE * side;
      const cx = x + offX;
      const cz = z + offZ;
      const cy = sampler.heightAt(cx, cz) + LIFT;

      const base = cursor * 6 * 3;
      for (let v = 0; v < 6; v++) {
        const [dx, dz] = corners[v] as [number, number];
        const p = new THREE.Vector3(dx, 0, dz).applyQuaternion(tilt.quaternion);
        const o = base + v * 3;
        positions[o] = cx + p.x;
        positions[o + 1] = cy;
        positions[o + 2] = cz + p.z;
      }
      ages[cursor] = 0;
      tints[cursor] = surfaceTint(sample.surface);
      writeColour(cursor, BASE_OPACITY);
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      cursor = (cursor + 1) % MAX;
    },

    update(dt: number): void {
      let dirty = false;
      for (let i = 0; i < MAX; i++) {
        const age = ages[i] as number;
        if (age === Infinity) continue;
        const next = age + dt;
        if (next >= FOOTPRINT_LIFE) {
          ages[i] = Infinity;
          writeColour(i, 0);
          dirty = true;
        } else {
          ages[i] = next;
          writeColour(i, BASE_OPACITY * footprintAlpha(next));
          dirty = true;
        }
      }
      if (dirty) colAttr.needsUpdate = true;
    },

    setEnabled(on: boolean): void {
      enabled = on;
      mesh.visible = on;
    },

    count(): number {
      let n = 0;
      for (let i = 0; i < MAX; i++) if (ages[i] !== Infinity) n++;
      return n;
    },

    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
