/**
 * How fast Pip's legs go, in one place: the walk animation (actors/playerMesh.ts) and the footstep
 * sounds (session/playerAdvance.ts) both read it, so a sprint quickens the steps you hear as much as
 * the steps you see.
 */
import type { PlayerTuning } from '../contracts';

/** 0 at a stand, 1 at walking pace. */
export function walkAmount(speed: number, t: PlayerTuning): number {
  return Math.min(1, Math.max(0, speed) / t.walkSpeed);
}

/** 0 at a brisk walk, 1 at full sprint: the run tucks the wings and leans into it. */
export function sprintAmount(speed: number, grounded: boolean, t: PlayerTuning): number {
  const from = t.walkSpeed * 1.15;
  return grounded && speed > from ? Math.min(1, (speed - from) / (t.sprintSpeed - from)) : 0;
}

/** The legs' swing, radians a second (the animation's bob runs at this rate). */
export function strideRate(speed: number, grounded: boolean, t: PlayerTuning): number {
  return 11 * (0.7 + walkAmount(speed, t) + sprintAmount(speed, grounded, t) * 0.55);
}

/** Footsteps heard at walking pace, a second. Slower than the legs: a footfall per leg would buzz. */
export const WALK_STEPS_PER_SECOND = 2.4;

/** Footsteps a second at this speed: the walking rate, scaled as the legs speed up. */
export function footstepRate(speed: number, grounded: boolean, t: PlayerTuning): number {
  return WALK_STEPS_PER_SECOND * strideRate(speed, grounded, t) / strideRate(t.walkSpeed, true, t);
}
