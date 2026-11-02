/**
 * The eased half of the ground framing: where the chase camera stands this frame, from the readings in
 * terrainFrame.ts.
 *
 * Uphill the camera drops and leans up the slope; ground or a roof behind raises it over. On steep
 * ground (Windscar Ridge's 50 degree faces) that was not enough: climbing, the face filled the frame
 * edge to edge, a flat blue wall with Pip buried at the bottom. So on steep ground the camera looks for
 * the stand that keeps the skyline in frame, the crest above or the far side of the valley, the next
 * thing to walk to. It tries standing farther back and lower (a cliff only fits in frame from a
 * distance) or, under a bank, a little closer (closer is lower), and takes the one that shows the
 * skyline with Pip still in the lower third, else the one that comes nearest. Then the view tips up
 * until the skyline sits just under the top edge, as far as Pip may sit below the middle (MAX_OFF).
 * On flat ground none of this moves anything. Coming straight down a face that steep, the bank behind
 * still holds the camera high: the slope below and the valley floor are in view, the horizon is not.
 *
 * Kept easing under reduce-motion as well: snapping would shake the view on every bump, which is more
 * motion, not less.
 */

import type { Point3 } from './occlusion';
import type { Ground } from './structures';
import { clearElevation, HALF_FOV, MAX_OFF, reachAlong, skyline, slopeAhead, TOP_ROOM } from './terrainFrame';

/** Gentler than this is flat as far as framing goes, so meadows and the opening frame keep the base pitch. */
const FLAT = (5 * Math.PI) / 180;
const MIN_DIST = 6;
/** Uphill, the camera drops by this share of the slope and the view leans up by this much more. */
const SLOPE_ELEV = 0.45;
const SLOPE_LOOK = 0.6;
/** Raised over ground behind, the view tips back up by this share of the rise, to keep the horizon. */
const LIFT_LOOK = 0.3;
/** Steep-ground stands: farther back (uphill) or closer (under a bank), and lower by DROP, not under LOW. */
const OUT = [1, 1.3, 1.6] as const;
const IN = [0.8, 0.65] as const;
const DROP = (5 * Math.PI) / 180;
const LOW = (2 * Math.PI) / 180;
/** A bank behind that lifts the camera more than this is steep ground too. */
const BANK = (12 * Math.PI) / 180;
/** The slope reading settles over this; the height rises over RISE and settles back over SETTLE. */
const SLOPE_TAU = 0.45;
const RISE_TAU = 0.1;
const SETTLE_TAU = 0.6;
/** The stand's distance and the skyline reading ease over these. */
const REACH_TAU = 0.7;
const SKY_TAU = 0.35;
/** A rise bigger than this in one frame is taken at once: easing it would put the ray in the ground. */
const JUMP = 0.6;

export interface Framing {
  /** Camera elevation above the pivot, radians. */
  elev: number;
  /** View axis below horizontal, radians; less than `elev` looks above the pivot. */
  look: number;
  /** Distance from the pivot along the elevation ray. */
  reach: number;
}

/** What a staged shot asks for, and how far it has eased in (0..1). */
export interface StagePull {
  elev: number;
  look: number;
  weight: number;
}

export interface FrameAsk {
  terrain: Ground;
  /** The terrain with buildings on it (structures.ts). */
  solid: Ground;
  pivot: Point3;
  foot: Point3;
  yaw: number;
  span: number;
  /** The elevation on flat ground. */
  base: number;
  /** How much higher than it looks the chase camera stands (rig.ts LIFT): the look it gets has this taken off. */
  lift: number;
  /** 0..1, how much this is the chase camera: the steep-ground stand and the skyline tilt are its alone. */
  chase: number;
  stage: StagePull | null;
  step: number;
  /** Take every reading at once (after a teleport or a load). */
  snap: boolean;
}

export interface GroundFrame {
  solve(ask: FrameAsk): Framing;
}

const settle = (from: number, to: number, step: number, tau: number): number =>
  from + (to - from) * (1 - Math.exp(-step / tau));

/** How far short of the top edge the skyline falls with Pip as low as MAX_OFF: 0 when it fits. */
const deficit = (sky: number, elev: number): number => Math.max(0, sky + TOP_ROOM - (HALF_FOV - (elev - MAX_OFF)));

/** Steep ground: the stand (distance share and elevation) that best keeps the skyline in frame. */
function steepStand(a: FrameAsk, want: number, up: boolean): { k: number; elev: number } {
  let best = { k: 1, elev: clearElevation(a.terrain, a.solid, a.pivot, a.yaw, a.span, want, a.foot), score: Infinity };
  const tries: number[] = up ? [...OUT] : [1, ...IN];
  for (const k of tries) {
    for (const from of up ? [want, Math.max(LOW, want - DROP)] : [want]) {
      const span = a.span * k;
      const elev = clearElevation(a.terrain, a.solid, a.pivot, a.yaw, span, from, a.foot);
      const miss = deficit(skyline(a.terrain, a.pivot, a.yaw, elev, span), elev);
      // Showing the skyline first; then the smallest change of distance; then the lower camera.
      const score = miss * 4 + Math.abs(k - 1) * 0.25 + Math.max(0, elev - want) * 0.3;
      if (score < best.score) best = { k, elev, score };
    }
  }
  return best;
}

export function createGroundFrame(): GroundFrame {
  let slope = 0;
  let elev = 0;
  let reachK = 1;
  let sky = 0;
  let primed = false;
  return {
    solve(a) {
      const { terrain, solid, pivot, foot, yaw, span, base, stage, step, snap } = a;
      const read = slopeAhead(terrain, foot.x, foot.z, yaw);
      const first = snap || !primed;
      primed = true;
      slope = first ? read : settle(slope, read, step, SLOPE_TAU);
      const g = stage?.weight ?? 0;
      const up = Math.max(0, slope - FLAT) * (1 - g);
      const want = base - SLOPE_ELEV * up + ((stage?.elev ?? base) - base) * g;
      let need = clearElevation(terrain, solid, pivot, yaw, span, want, foot);
      let k = 1;
      // Steep ground, for the chase camera only: the stand that keeps the skyline in frame.
      if (a.chase > 0.5 && (up > 0.02 || need - want > BANK)) {
        const stand = steepStand(a, want, up > 0.02);
        k = stand.k;
        need = stand.elev;
      }
      reachK = first ? k : settle(reachK, k, step, REACH_TAU);
      elev = first || need > elev + JUMP ? need : settle(elev, need, step, need > elev ? RISE_TAU : SETTLE_TAU);
      const reach = Math.max(MIN_DIST, reachAlong(terrain, pivot, yaw, elev, span * reachK));
      const seen = skyline(terrain, pivot, yaw, elev, reach);
      sky = first ? seen : settle(sky, seen, step, SKY_TAU);
      const chase = elev - Math.min(MAX_OFF, SLOPE_LOOK * up + LIFT_LOOK * Math.max(0, elev - want));
      // Tip up until the skyline sits under the top edge (the rig keeps Pip within MAX_OFF of the middle).
      const tipped = Math.min(chase, HALF_FOV - TOP_ROOM - sky + a.lift);
      const own = chase + (tipped - chase) * Math.min(1, a.chase);
      const look = own + ((stage?.look ?? own) - own) * g;
      return { elev, look, reach };
    },
  };
}
