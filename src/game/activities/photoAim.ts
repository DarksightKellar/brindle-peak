/**
 * The viewfinder's numbers and geometry, kept pure: what counts as centred and in range, how a photo
 * scores, and what each viewpoint is aimed at. photo.ts is the activity that uses them.
 */

import { angleDelta, clamp } from '../../core/contracts';
import type { ActivityDef, TerrainSampler, Vec3 } from '../../core/contracts';
import { auroraHeart, photoSubjectFor } from './photoSubjects';

export const PHOTO = {
  /** cos(9 deg): inside this cone the subject counts as centred (14.5 deg let it sit at the edge). */
  centreDot: 0.9877,
  minRange: 2.5,
  maxRange: 34,
  subjectMin: 13,
  subjectMax: 19,
  subjectHeight: 2.4,
  turnRate: (70 * Math.PI) / 180, tiltRate: (45 * Math.PI) / 180, // radians a second at full key
  pitchMin: (-20 * Math.PI) / 180, pitchMax: (55 * Math.PI) / 180,
  /** A slight upward look on entry, so the horizon sits low and the sky is in frame. */
  startPitch: (6 * Math.PI) / 180,
  /** Eye above Pip's feet. The camera rig uses the same height (camera/rig.ts VIEW_EYE). */
  eyeHeight: 1.0,
} as const;

/** cos of the yaw difference. 1 = dead centre, 0 = 90 degrees off. */
export function facingDot(yaw: number, targetYaw: number): number {
  return Math.cos(angleDelta(yaw, targetYaw));
}

/** Compass bearing from one point to another, matching `forward = (sin yaw, cos yaw)`. */
export function bearingTo(from: Vec3, to: Vec3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Unit view direction for an aim: yaw on the compass, pitch above the horizon. */
export function aimDirection(yaw: number, pitch: number): Vec3 {
  const c = Math.cos(pitch);
  return { x: Math.sin(yaw) * c, y: Math.sin(pitch), z: Math.cos(yaw) * c };
}

/** How centred a direction is in an aim, -1..1. `dir` must be a unit vector. */
export function aimDot(yaw: number, pitch: number, dir: Vec3): number {
  const f = aimDirection(yaw, pitch);
  return f.x * dir.x + f.y * dir.y + f.z * dir.z;
}

export function inFrame(dot: number, threshold: number = PHOTO.centreDot): boolean {
  return dot >= threshold;
}

export function inRange(distance: number, min: number = PHOTO.minRange, max: number = PHOTO.maxRange): boolean {
  return distance >= min && distance <= max;
}

/**
 * One two-digit number for the journal page, 50..99. Centring is most of it; standing at a
 * comfortable distance is the rest. Nothing here is a grade — the low end is still a photo.
 */
export function composition(dot: number, distance: number): number {
  const centring = clamp(dot, 0, 1);
  const comfortable = 1 - Math.min(1, Math.abs(distance - 12) / 22);
  return Math.round(clamp(50 + 45 * centring * comfortable, 50, 99));
}

function seedOf(def: ActivityDef): number {
  return Math.abs(Math.round(def.pos.x * 6151 + def.pos.z * 3079)) >>> 0;
}

/** Fallback for a viewpoint with no authored subject: a fixed point in the snow, seeded from its position. */
export function subjectOf(def: ActivityDef, terrain: TerrainSampler): Vec3 {
  const angle = (seedOf(def) % 6283) / 1000;
  const distance = PHOTO.subjectMin + ((seedOf(def) >>> 8) % 600) / 100;
  const x = def.pos.x + Math.sin(angle) * distance;
  const z = def.pos.z + Math.cos(angle) * distance;
  return { x, y: terrain.heightAt(x, z) + PHOTO.subjectHeight, z };
}

/** Where to look: a point on the ground, or a direction in the sky (no distance to stand at). */
export type Target = { kind: 'ground'; pos: Vec3 } | { kind: 'sky'; dir: Vec3 };

export function targetOf(def: ActivityDef, terrain: TerrainSampler): Target {
  const s = photoSubjectFor(def.id);
  if (s?.kind === 'aurora') {
    const heart = auroraHeart();
    return { kind: 'sky', dir: aimDirection(heart.yaw, heart.pitch) };
  }
  if (s?.kind === 'ground') return { kind: 'ground', pos: { x: s.x, y: terrain.heightAt(s.x, s.z) + s.lift, z: s.z } };
  return { kind: 'ground', pos: subjectOf(def, terrain) };
}
