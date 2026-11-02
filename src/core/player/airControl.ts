/**
 * Horizontal motion in the air: steering, momentum, and the glide's drift.
 *
 * Separated from `step.ts` because it is the part of flight with an opinion — how much the stick is
 * allowed to steer a falling bird, and how much speed a bird keeps when the stick is let go. It used to
 * live inline in the step function, where the difference between "steering" and "braking" was one
 * `approach()` call that nobody could see.
 */

import type { PlayerState } from '../contracts';
import type { PlayerTuning } from '../contracts';

/** Velocity approaches the target at a rate; never overshoots. */
const approach = (from: number, to: number, maxDelta: number): number => {
  const d = to - from;
  if (Math.abs(d) <= maxDelta) return to;
  return from + Math.sign(d) * maxDelta;
};

export interface AirMotion {
  wantX: number;
  wantZ: number;
  /** Magnitude of the directional input, 0..1. */
  mag: number;
  /** How long the jump key has been held; the glide needs it held, not tapped. */
  held: number;
  dt: number;
  tuning: PlayerTuning;
}

export function applyAirControl(state: PlayerState, m: AirMotion): void {
  const T = m.tuning;
  /*
   * Air control steers; it does not brake. Approaching zero whenever the stick was released meant a flap
   * stopped the bird dead in the air — height gained, distance lost, and the glide that followed had
   * nothing to carry. With no directional input the body keeps the momentum it left the ground with.
   */
  if (m.mag > 0.05) {
    const rate = (T.walkSpeed / T.groundAccelTime) * T.airControl * m.dt;
    state.vel.x = approach(state.vel.x, m.wantX, rate);
    state.vel.z = approach(state.vel.z, m.wantZ, rate);
  } else {
    const drag = 1 - 0.35 * m.dt;
    state.vel.x *= drag;
    state.vel.z *= drag;
  }
}

/** A held jump key in descent turns the fall into a glide that carries forward. */
export function applyGlide(state: PlayerState, m: AirMotion): void {
  const T = m.tuning;
  if (m.held <= T.glideHoldThreshold || state.vel.y > 0) return;
  state.mode = 'glide';
  state.vel.y = Math.max(state.vel.y, -T.glideFallSpeed);
  const fx = Math.sin(state.facing), fz = Math.cos(state.facing);
  const along = state.vel.x * fx + state.vel.z * fz;
  if (along >= T.glideDrift) return;
  const k = 1 - Math.exp(-4 * m.dt);
  state.vel.x += fx * (T.glideDrift - along) * k;
  state.vel.z += fz * (T.glideDrift - along) * k;
}
