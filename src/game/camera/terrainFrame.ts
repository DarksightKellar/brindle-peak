/**
 * How the chase camera reads the ground: the slope Pip is walking into, how far back the camera can
 * stand before the ground cuts its ray, the lowest height from which all of Pip can be seen over the
 * ground behind, and the skyline ahead. groundFrame.ts turns these into where the camera stands.
 *
 * The ray that must clear the ground runs to Pip's feet as well as to the pivot over Pip's head: the
 * critic saw Pip half-buried behind a foreground bank the ray to the head had cleared.
 *
 * Pure numbers against the terrain sampler, no renderer.
 */

import type { Point3 } from './occlusion';
import type { Ground } from './structures';

/** How far ahead the slope is read, and how much each reading counts. Near ground counts most. */
const AHEAD = [4, 9, 15, 23] as const;
const WEIGHT = [0.35, 0.3, 0.2, 0.15] as const;
/** Steeper than this and the reading is clamped: a cliff face is not a slope to look up. */
const MAX_SLOPE = (32 * Math.PI) / 180;
/** Raise the camera this much at a time while looking for a clear ray, up to TOP. Nothing clear by TOP
 *  (Pip at the foot of a wall) and the camera pulls in instead: at 80 it looked straight down at snow. */
const RAISE = (5 * Math.PI) / 180;
const TOP = (62 * Math.PI) / 180;
const STEPS = 18;
/** How far above the ground the ray to the pivot must stay, and the ray to Pip's feet (from FEET up). */
const SKIN = 0.5;
const FEET = 0.3;
const FEET_SKIN = 0.15;
/** However the view leans, Pip stays within this angle of the frame's centre: the lower third at most. */
export const MAX_OFF = (13 * Math.PI) / 180;
/** Half the vertical field of view (rig.ts FOV 38), and the room kept between the skyline and the top. */
export const HALF_FOV = (19 * Math.PI) / 180;
export const TOP_ROOM = (2.5 * Math.PI) / 180;
/** The skyline is the ground this far ahead of Pip: farther peaks are landmarks, not the next step. */
const SKY_AHEAD = 48;

/**
 * Ground rise ahead of Pip along the view heading, as an angle: positive uphill, negative downhill.
 * Measured from the ground under Pip, not Pip's body, so a jump does not tilt the view.
 */
export function slopeAhead(terrain: Ground, x: number, z: number, yaw: number): number {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const h0 = terrain.heightAt(x, z);
  let sum = 0;
  for (let i = 0; i < AHEAD.length; i++) {
    const d = AHEAD[i];
    sum += Math.atan((terrain.heightAt(x + fx * d, z + fz * d) - h0) / d) * WEIGHT[i];
  }
  return Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, sum));
}

/**
 * How far back along `yaw` at elevation `elev` the camera can stand before the ground cuts the ray
 * from `pivot`: `span` when the whole ray is clear, else just in front of the first hit.
 */
export function reachAlong(
  terrain: Ground, pivot: Point3, yaw: number, elev: number, span: number,
): number {
  const c = Math.cos(elev);
  const dx = -Math.sin(yaw) * c;
  const dy = Math.sin(elev);
  const dz = -Math.cos(yaw) * c;
  for (let i = 1; i <= STEPS; i++) {
    const t = (span * i) / STEPS;
    if (pivot.y + dy * t < terrain.heightAt(pivot.x + dx * t, pivot.z + dz * t) + SKIN) return t - 0.4;
  }
  return span;
}

/** Does the far quarter of the ray pass over every roof? The rest may cross one: the fade cuts it. */
function roofClear(solid: Ground, pivot: Point3, yaw: number, elev: number, span: number): boolean {
  const c = Math.cos(elev);
  for (let i = 6; i <= 8; i++) {
    const t = (span * i) / 8;
    if (pivot.y + Math.sin(elev) * t < solid.heightAt(pivot.x - Math.sin(yaw) * c * t, pivot.z - Math.cos(yaw) * c * t) + 1) return false;
  }
  return true;
}

/** Is the line from just above Pip's feet to the camera clear of the ground, all of Pip in view? */
function feetClear(terrain: Ground, pivot: Point3, foot: Point3, yaw: number, elev: number, span: number): boolean {
  const c = Math.cos(elev) * span;
  const cx = pivot.x - Math.sin(yaw) * c;
  const cy = pivot.y + Math.sin(elev) * span;
  const cz = pivot.z - Math.cos(yaw) * c;
  const fy = foot.y + FEET;
  for (let i = 2; i < STEPS; i++) {
    const t = i / STEPS;
    const x = foot.x + (cx - foot.x) * t;
    const z = foot.z + (cz - foot.z) * t;
    if (fy + (cy - fy) * t < terrain.heightAt(x, z) + FEET_SKIN) return false;
  }
  return true;
}

/**
 * The lowest elevation at or above `from` whose ray clears the ground at full distance, to the pivot
 * and to Pip's feet, and whose end quarter passes over any building (`solid`), else TOP. Clearing the
 * whole ray over a house Pip stands beside means looking straight down; clearing none of it leaves the
 * camera behind the house looking through a hole in it. The far quarter is a look over the roof, the
 * rest cut open by the view fade.
 */
export function clearElevation(
  terrain: Ground, solid: Ground, pivot: Point3, yaw: number, span: number, from: number, foot: Point3 = pivot,
): number {
  for (let e = from; e < TOP; e += RAISE) {
    if (roofClear(solid, pivot, yaw, e, span) && reachAlong(terrain, pivot, yaw, e, span) >= span
      && feetClear(terrain, pivot, foot, yaw, e, span)) return e;
  }
  return TOP;
}

/**
 * The skyline ahead as seen from a camera at `elev`, `span` back from the pivot: the highest angle
 * above horizontal of the ground up to SKY_AHEAD past Pip (negative: below the horizon).
 */
export function skyline(terrain: Ground, pivot: Point3, yaw: number, elev: number, span: number): number {
  const back = Math.cos(elev) * span;
  const cy = pivot.y + Math.sin(elev) * span;
  let sky = -Math.PI / 2;
  for (let d = 2; d <= SKY_AHEAD; d += 3) {
    const h = terrain.heightAt(pivot.x + Math.sin(yaw) * d, pivot.z + Math.cos(yaw) * d);
    sky = Math.max(sky, Math.atan2(h - cy, d + back));
  }
  return sky;
}
