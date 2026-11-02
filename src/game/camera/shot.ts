/**
 * The conversation two-shot: where the camera stands while Pip talks to someone.
 *
 * The chase camera looks at Pip alone, so a conversation used to play with the speaker wherever the
 * walk-up happened to leave them, often off-screen. This frames the two of them as a scene: the camera
 * stands to one side of the pair, nearly square to the line between them (SHOT_ANGLE), so they stand
 * apart in the frame instead of one behind the other, and both turn a little toward the lens to talk
 * (staging.ts), so both faces read three-quarter on. Over Pip's shoulder at 62 degrees the speaker
 * stood almost behind the bird (Pip and Bram overlapped) and Pip was a back.
 *
 * Of the two sides, and a few angles either way of square, it takes the first whose camera stands in
 * the open with a clear view of both: not inside a roof (the critic's talk with Orla played from
 * inside the bakery's snowy roof, Pip and Orla as x-ray outlines), not behind the ground or a house,
 * not among the mast's legs, not facing a bank that fills the frame behind them (wall); on steep ground
 * from higher up if it must, looking down the slope at them. Among clear ones, the side nearer the current view, so the turn is small.
 * An activity's subject (Speaker.facing) still prefers the side that sees its front.
 *
 * Pure numbers, no renderer, so the geometry can be reasoned about on its own.
 */

import type { Point3 } from './occlusion';
import type { Ground } from './structures';
import { HALF_FOV, TOP_ROOM } from './terrainFrame';

/** Who Pip is talking to: where they stand, and which way they face (0 = +Z) if it matters. */
export interface Speaker extends Point3 {
  facing?: number;
}

export interface Shot {
  /** Camera heading, same convention as the rig's yaw (0 looks along +Z). */
  yaw: number;
  /** The point the camera orbits and looks at: between the two, at chest height. */
  pivot: Point3;
  dist: number;
  /** Camera elevation over the pivot, radians: the rig's own pitch unless the ground asks for higher. */
  elev: number;
}

/** What the camera must keep out of: the ground with buildings on it, and the mast's column. */
export interface ShotRoom {
  solid: Ground;
  pillar?: { x: number; z: number; radius: number };
}

/** Off the Pip-to-speaker line: 0 would hide the speaker behind Pip, 90 is square on. */
const SHOT_ANGLE = (80 * Math.PI) / 180;
/** Tried in this order on each side when the square shot is blocked. */
const VARY = [0, -15, 15, -30, 30, -45].map((d) => (d * Math.PI) / 180);
/** Closer than the chase distance: a conversation is a near thing. Grows with how far apart they stand. */
const SHOT_DIST = 7.5;
const SHOT_SPREAD = 0.9;
const SHOT_MAX = 12;
const CHEST = 1.0;
/** The middle of the pair, a touch toward the speaker. */
const LEAN = 0.52;
/** The camera's height over the pivot: the rig's PITCH first; higher stands for steep ground, where a
 *  shot at chase height stands in the slope on one side and faces a bank on the other. */
const ELEVS = [13, 24, 36].map((d) => (d * Math.PI) / 180);
/** Score per radian of elevation above the first. */
const HIGH_COST = 4;
/** Ground past the pair sampled this far beyond the pivot; a rise this far over the top edge is a full wall. */
const WALL_AT = [2, 5, 9, 15, 23, 33];
const WALL_SPAN = (12 * Math.PI) / 180;
const WALL_COST = 1.2;

export const shortestTurn = (from: number, to: number): number => {
  const full = Math.PI * 2;
  let d = (to - from) % full;
  if (d > Math.PI) d -= full;
  if (d < -Math.PI) d += full;
  return d;
};

/** Does the line from the camera to this point stay clear of the ground and every roof? */
function sees(solid: Ground, cam: Point3, to: Point3): boolean {
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const x = cam.x + (to.x - cam.x) * t;
    const z = cam.z + (to.z - cam.z) * t;
    if (cam.y + (to.y - cam.y) * t < solid.heightAt(x, z) + 0.2) return false;
  }
  return true;
}

/** How badly a camera looking along `yaw` from `dist` behind `pivot` is placed: 0 when in the open. */
function blocked(room: ShotRoom, pivot: Point3, yaw: number, elev: number, dist: number, pip: Point3, other: Point3): number {
  const c = Math.cos(elev) * dist;
  const cam = { x: pivot.x - Math.sin(yaw) * c, y: pivot.y + Math.sin(elev) * dist, z: pivot.z - Math.cos(yaw) * c };
  let bad = 0;
  if (room.solid.heightAt(cam.x, cam.z) + 1 > cam.y) bad += 4;
  if (!sees(room.solid, cam, { x: pip.x, y: pip.y + CHEST, z: pip.z })) bad += 2;
  if (!sees(room.solid, cam, { x: other.x, y: other.y + CHEST, z: other.z })) bad += 2;
  const p = room.pillar;
  if (p) {
    // The mast within its radius of the camera, or of the middle of either sightline.
    const near = (x: number, z: number): boolean => Math.hypot(x - p.x, z - p.z) < p.radius;
    if (near(cam.x, cam.z) || near((cam.x + pip.x) / 2, (cam.z + pip.z) / 2) || near((cam.x + other.x) / 2, (cam.z + other.z) / 2)) bad += 3;
  }
  return bad;
}

/**
 * How much of a wall the camera faces past the pair, 0..1: ground rising over the top of the frame, so
 * there is no sky behind them. At Tuck's bridge a shot square to the pair looked straight into the
 * ridge, a flat bank of snow filling the frame with the two of them at its foot.
 */
function wall(solid: Ground, pivot: Point3, yaw: number, elev: number, dist: number): number {
  const c = Math.cos(elev) * dist;
  const camY = pivot.y + Math.sin(elev) * dist;
  const top = HALF_FOV - elev - TOP_ROOM;
  let worst = -Infinity;
  for (const d of WALL_AT) {
    const h = solid.heightAt(pivot.x + Math.sin(yaw) * d, pivot.z + Math.cos(yaw) * d);
    worst = Math.max(worst, Math.atan2(h - camY, c + d));
  }
  return Math.min(1, Math.max(0, (worst - top) / WALL_SPAN));
}

export function twoShot(pip: Point3, other: Speaker, fromYaw: number, room?: ShotRoom): Shot {
  const dx = other.x - pip.x;
  const dz = other.z - pip.z;
  const line = Math.atan2(dx, dz);
  const pivot = { x: pip.x + dx * LEAN, y: Math.max(pip.y, other.y) + CHEST, z: pip.z + dz * LEAN };
  const dist = Math.min(SHOT_MAX, SHOT_DIST + Math.hypot(dx, dz) * SHOT_SPREAD);
  // How much the subject faces away from a camera looking along `yaw`: below zero it faces the lens.
  const away = (yaw: number): number =>
    other.facing === undefined ? 0 : Math.sin(other.facing) * Math.sin(yaw) + Math.cos(other.facing) * Math.cos(yaw);
  let best = { yaw: line + SHOT_ANGLE, elev: ELEVS[0], score: Infinity };
  for (const elev of room ? ELEVS : ELEVS.slice(0, 1)) {
    for (const side of [1, -1]) {
      for (const v of VARY) {
        const yaw = line + side * (SHOT_ANGLE + v);
        const bad = room ? blocked(room, pivot, yaw, elev, dist, pip, other) + wall(room.solid, pivot, yaw, elev, dist) * WALL_COST : 0;
        // Clear first, with sky behind the pair; then square on; then at chase height; then the side
        // that sees a subject's front; then the smaller turn.
        const score = bad * 10 + Math.abs(v) * 2 + (elev - ELEVS[0]) * HIGH_COST + Math.max(0, away(yaw)) * 1.5
          + Math.abs(shortestTurn(fromYaw, yaw)) * 0.3;
        if (score < best.score) best = { yaw, elev, score };
      }
    }
  }
  return { yaw: best.yaw, pivot, dist, elev: best.elev };
}
