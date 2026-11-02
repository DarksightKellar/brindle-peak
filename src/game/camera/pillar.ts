/**
 * Keeping the lens out of the radio mast.
 *
 * The mast is an open lattice 24 u tall on a 3.6 u plinth. Rising over it like a house would look
 * straight down on the summit, and the view fade only clears it whole once the lens is all but inside
 * it (lensClear.ts), so walking past it the chase camera stood a few units off its legs with red
 * girders across half the screen (critic: "camera inside the mast lattice"). Pulling the camera in
 * front of it put the lens in the bird. Instead the camera swings round it: the boom from Pip to the
 * camera turns by the smallest angle that keeps its far part RADIUS clear of the mast's foot, the way
 * a person steps aside to see past a post. The offset is the rig's to ease; the heading underneath is
 * left alone, so nothing about which way W walks changes.
 *
 * Pure numbers, no renderer.
 */

import type { TerrainSampler } from '../../core/contracts';
import { PEAK } from '../../data/zones';
import { MAST_HEIGHT } from '../world/summit';
import type { Point3 } from './occlusion';

export interface Pillar {
  x: number;
  z: number;
  /** Ground under it and its tip, world heights. */
  base: number;
  top: number;
}

/** How near the camera's boom may come to the mast's axis (legs 1.7 out, plinth 1.8). */
export const RADIUS = 6.5;
/** Only the far part of the boom counts: near Pip, the mast is beside the bird, not the lens. */
const FROM = 0.45;
const SAMPLES = 6;
/** Swing in steps of this, up to MAX either way. */
const STEP = (4 * Math.PI) / 180;
const MAX = (100 * Math.PI) / 180;
/** How much shorter the other side must be before the swing changes sides. */
const STICK = (30 * Math.PI) / 180;

/** The radio mast as a pillar: its foot on the summit, its antenna tip on top. */
export const mastPillar = (terrain: Pick<TerrainSampler, 'heightAt'>): Pillar => {
  const base = terrain.heightAt(PEAK.x, PEAK.z);
  return { x: PEAK.x, z: PEAK.z, base, top: base + MAST_HEIGHT + 3.2 };
};

/** Is the boom from `pivot` back along `yaw` for `reach`, at height `camY`, clear of the pillar? */
function clear(p: Pillar, pivot: Point3, yaw: number, reach: number, camY: number): boolean {
  if (camY > p.top + 1) return true;
  const bx = -Math.sin(yaw);
  const bz = -Math.cos(yaw);
  for (let i = 0; i <= SAMPLES; i++) {
    const t = reach * (FROM + ((1 - FROM) * i) / SAMPLES);
    if (Math.hypot(pivot.x + bx * t - p.x, pivot.z + bz * t - p.z) < RADIUS) return false;
  }
  return true;
}

/**
 * The yaw offset (radians, added to the view's yaw) that keeps the boom clear of the pillar: 0 when it
 * already is, else the smallest swing, staying on the side of `prefer` (the current offset) so the
 * camera does not flip from one side to the other as Pip walks past.
 */
export function aroundPillar(p: Pillar, pivot: Point3, yaw: number, reach: number, camY: number, prefer: number): number {
  if (Math.hypot(pivot.x - p.x, pivot.z - p.z) > reach + RADIUS) return 0;
  if (clear(p, pivot, yaw, reach, camY)) return 0;
  const swing = (side: number): number => {
    for (let a = STEP; a <= MAX; a += STEP) if (clear(p, pivot, yaw + side * a, reach, camY)) return a;
    return Infinity;
  };
  const right = swing(1);
  const left = swing(-1);
  if (right === Infinity && left === Infinity) return 0;
  // Stay on the side already taken unless the other is a good deal shorter.
  const bias = prefer > 0 ? -STICK : prefer < 0 ? STICK : 0;
  return right + bias <= left ? right : -left;
}
