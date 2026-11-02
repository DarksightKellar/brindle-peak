/**
 * Turning what the world draws into what the player bumps into.
 *
 * Two rules, both learned from the failure this file fixes: the player could walk through fences,
 * rocks, trees and whole buildings because nothing in the project ever produced a collider.
 *
 * 1. Derive colliders from the same data the visuals are built from — the scatter placements and the
 *    landmark geometry — never from a second hand-written table. This project has already been bitten
 *    twice by a duplicated constant drifting (the world seed, the grade); a collider table that
 *    disagrees with the trees on screen is the same bug wearing a hat.
 * 2. Only collide with things that would actually stop a person. Snow drifts and brush are walkable;
 *    flat slabs and the ground itself are not obstacles; a building's roof overhang should not stick
 *    out as an invisible wall.
 */

import * as THREE from 'three';
import type { Collider } from '../../core/player/collide';
import type { Placement } from './scatterRules';
import { FENCE_PITCH } from './scatterRules';
import type { PropKind } from './props';

import { BIRD_BULK } from './birdBulk';

/** Drawn radius of each thin upright at scale 1 (props.ts). Kinds absent here and below are walkable. */
const UPRIGHT: Partial<Record<PropKind, number>> = { pine: 0.22, bare: 0.22, signpost: 0.11, lantern: 0.09 };
/** Stump radius per variant (props.ts). Low, so padded less: the bird's shoulders pass over it. */
const STUMP = [0.48, 0.66];

/**
 * What a scattered prop stops, matched to what is drawn. A rock is two or three stones (props.ts), so
 * it is two or three circles where the stones are, as wide as they are at the bird's body height.
 */
export function solidOf(kind: PropKind, variant: number, x: number, z: number, yaw: number, scale: number): Collider[] {
  if (kind === 'rock') {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // Local (lx, lz) under a Y turn of yaw lands at (lx cos + lz sin, -lx sin + lz cos).
    const stone = (lx: number, lz: number, r: number): Collider =>
      ({ kind: 'circle', x: x + (lx * c + lz * s) * scale, z: z + (-lx * s + lz * c) * scale, r: r * scale + 0.15 });
    const out = [stone(0, 0, 1.15), stone(1.0, 0.4, 0.62)];
    if (variant % 2 === 1) out.push(stone(-0.8, -0.5, 0.45));
    return out;
  }
  if (kind === 'stump') return [{ kind: 'circle', x, z, r: STUMP[variant % 2] * scale + 0.15 }];
  const r = UPRIGHT[kind];
  return r === undefined ? [] : [{ kind: 'circle', x, z, r: r * scale + BIRD_BULK }];
}

/** Smallest horizontal half-extent worth colliding with; anything slighter is scenery. */
const MIN_STRUCTURE_HALF = 0.6;
/** Taller than this and it is a structure rather than a ground slab. */
const MIN_STRUCTURE_HEIGHT = 1.2;
/** Wider than this and it is scenery spanning a whole zone, not a wall. */
const MAX_STRUCTURE_SPAN = 40;

/** Rail height of the fence geometry, world units. */
export const FENCE_HEIGHT = 1.15;

export function propColliders(placements: readonly Placement[]): Collider[] {
  const out: Collider[] = [];
  for (const p of placements) {
    if (p.kind === 'fence') {
      // The rail geometry runs from the anchor along local +X for one pitch, then yaw turns it.
      // A capsule along that span is what a fence is; a circle at the post would let you walk
      // between the posts, which is the reported bug.
      const cos = Math.cos(p.yaw);
      const sin = Math.sin(p.yaw);
      out.push({
        kind: 'segment',
        ax: p.x, az: p.z,
        bx: p.x + cos * FENCE_PITCH, bz: p.z - sin * FENCE_PITCH,
        r: 0.22,
        // A bird with more clearance than this is over the rail, not blocked by it. Measured against the
        // rendered fence: posts stand 1.15 u and the rails sit below their caps.
        top: FENCE_HEIGHT,
      });
      continue;
    }
    // Drift and brush give nothing back: walk through the snow, as intended.
    out.push(...solidOf(p.kind, p.variant, p.x, p.z, p.yaw, p.scale));
  }
  return out;
}

/**
 * One box per structural mesh in an authored landmark group.
 *
 * Buildings are merged meshes, so a mesh's own bounding box is the building, turned the way the mesh
 * is turned. (It used to be the world-aligned box round the turned mesh: for a house set at an angle
 * that is a much bigger square, and Nana's cabin, turned to face the arrival point, walled off its
 * own porch: walking at her from the north-east, Pip stopped on an invisible corner.) Ground slabs and
 * small dressings are rejected by shape: a slab is flat, a dressing is short. Roof overhang is trimmed
 * by a margin so the wall is what stops you rather than the eaves.
 */
export function structureColliders(group: THREE.Object3D): Collider[] {
  const out: Collider[] = [];
  const centre = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const size = new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse((child) => {
    // A landmark that knows its own footprint says so (summit.ts); its meshes are then not boxed.
    const own = child.userData.colliders as Collider[] | undefined;
    if (own) out.push(...own);
    if (!(child instanceof THREE.Mesh) || child.userData.noCollide === true) return;
    child.geometry.computeBoundingBox();
    const box = child.geometry.boundingBox;
    if (!box || box.isEmpty()) return;
    child.matrixWorld.decompose(centre, turn, scale);
    box.getSize(size).multiply(scale);
    if (size.y < MIN_STRUCTURE_HEIGHT) return;
    if (size.x > MAX_STRUCTURE_SPAN || size.z > MAX_STRUCTURE_SPAN) return;
    const hw = size.x / 2;
    const hd = size.z / 2;
    if (hw < MIN_STRUCTURE_HALF || hd < MIN_STRUCTURE_HALF) return;
    box.getCenter(centre).applyMatrix4(child.matrixWorld);
    // Only a turn about the vertical is expected of a building; read it off the turned local x axis.
    const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(turn);
    out.push({
      kind: 'box',
      x: centre.x, z: centre.z,
      // 8% off each axis: the roof and snow cap overhang the wall they sit on.
      hw: hw * 0.92, hd: hd * 0.92, yaw: Math.atan2(-ax.z, ax.x),
    });
  });
  return out;
}

/** Merge prop and structure colliders into the list the player is resolved against. */
export function buildColliders(worldRoot: THREE.Object3D, placements: readonly Placement[]): Collider[] {
  return [...propColliders(placements), ...structureColliders(worldRoot)];
}
