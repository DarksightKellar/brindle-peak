/**
 * The arrows that say which way to go.
 *
 * `floorArrowTo` is the one beside Pip for activities that send Pip somewhere: the race's next gate, the
 * snowman's ring. It lies on the snow a step out from Pip, nose the real way to go, and nudges forward
 * in a slow beat. It used to hang over Pip's head facing the camera, rolled toward the target; with the
 * target behind, it pointed down at Pip and read as "this is you" (director, round 27). On the ground,
 * pointing back toward the camera reads as "come back this way". It shrinks as the target comes close,
 * when the target itself is the better pointer.
 *
 * `signTo` is the upright sign facing the camera, rolled toward where it points: up is "ahead",
 * sideways is "turn". The bell's wind arrow uses it, hung over the bell rather than on the snow.
 */

import { angleDelta } from '../../core/contracts';
import type { Vec2, Vec3 } from '../../core/contracts';
import type { PlacedMarker } from './markerLooks';

/** The sign hangs over its point, nudged this far toward the target. */
const ARROW_OUT = 0.5;
const ARROW_UP = 2.3;
/** The sign leans at most this far (radians) from up. */
const ARROW_MAX_ROLL = 2.4;
/** The floor arrow's middle sits this far out from Pip, clear of the body when the way is ahead, and
 * nudges this much further on each beat. */
const FLOOR_OUT = 2.4;
const FLOOR_NUDGE = 0.25;
/** Half the floor arrow's length at size 1, for laying it along a slope. */
const FLOOR_HALF = 0.9;
/** Above the snow by more than this, Pip is flying: the arrow hangs level just under Pip's feet. */
const FLOOR_AIRBORNE = 1.2;

export function floorArrowTo(from: Vec3, target: Vec2, groundAt: (x: number, z: number) => number, now: number): PlacedMarker[] {
  const dx = target.x - from.x, dz = target.z - from.z;
  const far = Math.hypot(dx, dz);
  if (far < 3) return [];
  const yaw = Math.atan2(dx, dz);
  const sx = Math.sin(yaw), sz = Math.cos(yaw);
  const size = 0.6 + 0.35 * Math.min(1, (far - 3) / 6);
  const out = FLOOR_OUT + FLOOR_NUDGE * Math.max(0, Math.sin(now * 4));
  const x = from.x + sx * out, z = from.z + sz * out;
  const flying = from.y - groundAt(from.x, from.z) > FLOOR_AIRBORNE;
  let y = from.y - 0.3;
  let pitch = 0;
  if (!flying) {
    // Laid along the slope, so it is not half buried going uphill or floating going down.
    const h = FLOOR_HALF * size;
    const nose = groundAt(x + sx * h, z + sz * h), tail = groundAt(x - sx * h, z - sz * h);
    y = (nose + tail) / 2;
    pitch = -Math.atan2(nose - tail, 2 * h);
  }
  return (['arrow-floor-rim', 'arrow-floor'] as const).map((look) => ({ shape: 'float', look, x, y, z, yaw, pitch, size }));
}

export function signTo(from: Vec3, target: Vec2, camYaw: number): PlacedMarker[] {
  const dx = target.x - from.x, dz = target.z - from.z;
  const far = Math.hypot(dx, dz);
  if (far < 3) return [];
  const yaw = Math.atan2(dx, dz);
  const size = 0.55 + 0.45 * Math.min(1, (far - 3) / 6);
  const at = { x: from.x + Math.sin(yaw) * ARROW_OUT, y: from.y + ARROW_UP, z: from.z + Math.cos(yaw) * ARROW_OUT };
  const delta = angleDelta(camYaw, yaw);
  const roll = Math.sign(delta) * Math.min(Math.abs(delta), ARROW_MAX_ROLL);
  return (['arrow-rim', 'arrow'] as const).map((look) => ({ shape: 'float', look, ...at, yaw: camYaw + Math.PI, tilt: roll, size }));
}

export type Way = 'ahead' | 'left' | 'right' | 'behind';

/** Within this of the view's heading (radians) the target is "ahead"; past WAY_BEHIND, "behind you". */
const WAY_AHEAD = 0.5;
// Past a right angle, as the compass strip has it (hudCompass.ts): at 2.3 the panel said "27 u on your
// left" while the compass over it said "behind you" (critic round 22).
const WAY_BEHIND = Math.PI / 2;
/** A word is kept until the target is this far (radians) past the edge of its band. */
const WAY_HOLD = 0.15;

/**
 * Which way a target is from the view, in words, holding the last word near a band's edge: a gate on
 * the line between "ahead" and "on your left" had the race's panel flicking between the two every frame
 * (critic round 28). `turn` is the target's bearing from the view's heading, left positive.
 */
export function steadyWay(turn: number, last: Way | null): Way {
  const a = Math.abs(turn);
  const raw: Way = a < WAY_AHEAD ? 'ahead' : a > WAY_BEHIND ? 'behind' : turn > 0 ? 'left' : 'right';
  if (last === null || raw === last) return raw;
  const keep = last === 'ahead' ? a < WAY_AHEAD + WAY_HOLD
    : last === 'behind' ? a > WAY_BEHIND - WAY_HOLD
    : (turn > 0) === (last === 'left') && a > WAY_AHEAD - WAY_HOLD && a < WAY_BEHIND + WAY_HOLD;
  return keep ? last : raw;
}
