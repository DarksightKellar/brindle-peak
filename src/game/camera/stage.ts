/**
 * The two composed shots of the ending. The homecoming's is at the bottom (homeStage). The radio
 * finale's: the mast, Edda and Pip small against the northern sky, the aurora over them, while the
 * valley answers on the radio.
 *
 * The voices on the radio are far away, so the two-shot had nobody near to frame and the camera fell
 * back to the chase view: a blank blue slope with the mast cut off at the top. This is the payoff of the
 * whole climb, so it gets a composed wide shot instead. The camera stands behind Edda and Pip, low,
 * looking past them up at the mast and the northern sky where the aurora hangs, so the pair are small
 * in the lower third and the rest is mast and sky. Over the conversation it drifts slowly in.
 *
 * Pure numbers, no renderer.
 */

import type { Point3 } from './occlusion';
import type { Shot } from './shot';

/** A composed shot: a two-shot's framing plus its own camera height and look, both in radians. */
export interface Stage extends Shot {
  /** Camera elevation above the pivot. */
  elev: number;
  /** View axis below horizontal: negative looks up. */
  look: number;
}

/** North is -z, yaw PI. The camera looks from the pair toward the mast, but never more than TURN off
 *  north: past that the aurora (render/aurora.ts, about 50 deg either side of north) leaves the frame. */
const NORTH = Math.PI;
const TURN = 0.75;
/** Low, a little above the pair's chest. */
const ELEV = (2 * Math.PI) / 180;
/**
 * The view tips up until the mast's tip sits TOP_ROOM below the frame's top edge (half the vertical
 * FOV is 19 deg), but never so far that the pair's feet fall more than FEET_ROOM below the centre:
 * lower than that and the dialogue box covers them.
 */
const HALF_FOV = (19 * Math.PI) / 180;
const TOP_ROOM = (3.5 * Math.PI) / 180;
const FEET_ROOM = (11 * Math.PI) / 180;
/** The slow push-in: from FAR to NEAR over DRIFT seconds. */
const FAR = 46;
const NEAR = 40;
const DRIFT = 40;
/** The pivot is the pair, at chest height. */
const CHEST = 1.0;

const turn = (from: number, to: number): number => {
  const d = (((to - from) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return Math.max(-TURN, Math.min(TURN, d));
};

/**
 * @param mastTop the tip of the mast above its foot.
 * @param t seconds since the shot began, for the push-in.
 * @param still reduce-motion: no push-in, the near framing from the start.
 */
export function radioStage(
  mast: Point3, mastTop: number, edda: Point3, pip: Point3, t: number, still: boolean,
): Stage {
  const px = (edda.x + pip.x) / 2;
  const pz = (edda.z + pip.z) / 2;
  const py = Math.max(edda.y, pip.y) + CHEST;
  const k = still ? 1 : Math.min(1, t / DRIFT);
  const dist = FAR + (NEAR - FAR) * k * k * (3 - 2 * k);
  const yaw = NORTH + turn(NORTH, Math.atan2(mast.x - px, mast.z - pz));
  // Where the camera will stand, near enough, to aim from.
  const back = dist * Math.cos(ELEV);
  const cx = px - Math.sin(yaw) * back;
  const cz = pz - Math.cos(yaw) * back;
  const cy = py + dist * Math.sin(ELEV);
  const tip = Math.atan2(mast.y + mastTop - cy, Math.hypot(mast.x - cx, mast.z - cz));
  const feet = Math.atan2(Math.min(edda.y, pip.y) - cy, back);
  const up = Math.min(tip - (HALF_FOV - TOP_ROOM), feet + FEET_ROOM);
  return { yaw, pivot: { x: px, y: py, z: pz }, dist, elev: ELEV, look: -up };
}

/** The homecoming: square to the pair, low, their feet this far under the middle so the sky fills the top. */
const HOME_DIST = 10;
const HOME_ELEV = (5 * Math.PI) / 180;
const HOME_FEET = (12 * Math.PI) / 180;

/**
 * The ending's quiet beat: after Nana's last line the conversation's two-shot gave way to the chase
 * camera, which stood on the cabin roof with Nana out of frame, and then the card came. This holds Pip
 * and Nana together at her door instead, side by side and small under the dusk sky: the camera stands
 * square to the pair on whichever side looks more nearly north, where the aurora hangs.
 */
export function homeStage(nana: Point3, pip: Point3): Stage {
  const line = Math.atan2(nana.x - pip.x, nana.z - pip.z);
  const a = line + Math.PI / 2;
  const b = line - Math.PI / 2;
  const off = (y: number): number => Math.abs((((y - NORTH) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  const yaw = off(a) <= off(b) ? a : b;
  const py = Math.max(nana.y, pip.y) + CHEST;
  const feet = Math.atan2(Math.min(nana.y, pip.y) - (py + HOME_DIST * Math.sin(HOME_ELEV)), HOME_DIST * Math.cos(HOME_ELEV));
  return {
    yaw,
    pivot: { x: (nana.x + pip.x) / 2, y: py, z: (nana.z + pip.z) / 2 },
    dist: HOME_DIST,
    elev: HOME_ELEV,
    look: -(feet + HOME_FEET),
  };
}
