/**
 * A thrown snowball, as plain arithmetic: aim, loft, flight and what it strikes.
 *
 * The old throw resolved instantly against a cone around the camera's yaw. The camera does not turn
 * during an activity, so the aim was frozen, and five presses ended the game with no hits. Now the
 * activity owns an aim yaw that A / D (or the arrow keys, which share the axis) turn, and the ball is
 * a real projectile that hits or misses the real target.
 *
 * Aim is yaw only — keyboard players have no second axis to spare. The loft is solved for them: the
 * throw arcs so it arrives at the height of whatever target the aim is nearest, at that target's
 * distance. Lined up, it hits; off by more than a target's width, it sails past and lands in the snow.
 */

import { angleDelta } from '../../core/contracts';
import type { Vec3 } from '../../core/contracts';

export const FLIGHT = {
  /** Horizontal speed, u/s. Quick enough that a swinging target barely needs leading. */
  speed: 26,
  gravity: 14,
  /** Hand height above the feet. */
  hand: 1.3,
  /** Aim turn rate, radians per second at full stick. */
  turn: 1.1,
  /** A target further off the aim than this is not the one being aimed at. */
  lockCone: 0.45,
  /** Distance a throw with nothing in front of it is lofted for. */
  idleRange: 14,
  /** The ball is gone after this many seconds even if nothing stopped it. */
  life: 3,
} as const;

export interface Shot {
  pos: Vec3;
  vel: Vec3;
  age: number;
  /** Set once it has struck something or the ground; it then stops moving. */
  done: boolean;
}

export interface Strikeable {
  /** Centre of the target's hit volume, world space. */
  pos: Vec3;
  /** Horizontal hit radius. */
  radius: number;
  /** Half-height of the hit volume around `pos.y`. */
  half: number;
}

/** New aim after one frame of A / D. `moveX` > 0 (D, right arrow) turns right. */
export function turnAim(yaw: number, moveX: number, dt: number): number {
  const stick = Math.abs(moveX) < 0.1 ? 0 : moveX;
  return yaw - stick * FLIGHT.turn * dt;
}

/** The target the aim is nearest to, within the lock cone, or -1. */
export function aimedTarget(from: Vec3, yaw: number, targets: readonly (Strikeable | null)[]): number {
  let best = -1;
  let bestErr: number = FLIGHT.lockCone;
  targets.forEach((t, i) => {
    if (!t) return;
    const err = Math.abs(angleDelta(yaw, Math.atan2(t.pos.x - from.x, t.pos.z - from.z)));
    if (err <= bestErr) {
      best = i;
      bestErr = err;
    }
  });
  return best;
}

/** Launch velocity that carries a ball from `from` along `yaw` to height `y` at distance `range`. */
export function loft(from: Vec3, yaw: number, range: number, y: number): Vec3 {
  const t = Math.max(0.15, range / FLIGHT.speed);
  const vy = (y - from.y + 0.5 * FLIGHT.gravity * t * t) / t;
  return { x: Math.sin(yaw) * FLIGHT.speed, y: vy, z: Math.cos(yaw) * FLIGHT.speed };
}

/** Throw from a player standing at `feet`, lofted for the aimed target if there is one. */
export function launch(
  feet: Vec3,
  yaw: number,
  targets: readonly (Strikeable | null)[],
  groundAt: (x: number, z: number) => number,
): Shot {
  const from = { x: feet.x, y: feet.y + FLIGHT.hand, z: feet.z };
  const i = aimedTarget(from, yaw, targets);
  const t = i >= 0 ? targets[i] : null;
  let vel: Vec3;
  if (t) {
    vel = loft(from, yaw, Math.hypot(t.pos.x - from.x, t.pos.z - from.z), t.pos.y);
  } else {
    const r = FLIGHT.idleRange;
    vel = loft(from, yaw, r, groundAt(from.x + Math.sin(yaw) * r, from.z + Math.cos(yaw) * r));
  }
  return { pos: from, vel, age: 0, done: false };
}

/**
 * Advance a shot by `dt` and return the index of the target it struck, or -1.
 *
 * The step is swept in small slices so a fast ball cannot tunnel through a thin post between frames.
 */
export function stepShot(
  shot: Shot,
  dt: number,
  targets: readonly (Strikeable | null)[],
  groundAt: (x: number, z: number) => number,
): number {
  if (shot.done) return -1;
  const slices = Math.max(1, Math.ceil((dt * FLIGHT.speed) / 0.25));
  const h = dt / slices;
  for (let s = 0; s < slices; s++) {
    shot.pos.x += shot.vel.x * h;
    shot.pos.y += shot.vel.y * h;
    shot.pos.z += shot.vel.z * h;
    shot.vel.y -= FLIGHT.gravity * h;
    shot.age += h;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t) continue;
      const flat = Math.hypot(shot.pos.x - t.pos.x, shot.pos.z - t.pos.z);
      if (flat <= t.radius && Math.abs(shot.pos.y - t.pos.y) <= t.half) {
        shot.done = true;
        return i;
      }
    }
    const floor = groundAt(shot.pos.x, shot.pos.z);
    if (shot.pos.y <= floor || shot.age >= FLIGHT.life) {
      shot.pos.y = Math.max(shot.pos.y, floor);
      shot.done = true;
      return -1;
    }
  }
  return -1;
}

/** Points along the arc a throw at `yaw` would fly, for the aim line. Stops at the ground. */
export function previewArc(
  feet: Vec3,
  yaw: number,
  targets: readonly (Strikeable | null)[],
  groundAt: (x: number, z: number) => number,
  count = 9,
): Vec3[] {
  const shot = launch(feet, yaw, targets, groundAt);
  const aimed = aimedTarget(shot.pos, yaw, targets);
  const t = aimed >= 0 ? targets[aimed] : null;
  const range = t ? Math.hypot(t.pos.x - shot.pos.x, t.pos.z - shot.pos.z) : FLIGHT.idleRange;
  const out: Vec3[] = [];
  for (let k = 1; k <= count; k++) {
    const s = (k / count) * (range / FLIGHT.speed);
    const y = shot.pos.y + shot.vel.y * s - 0.5 * FLIGHT.gravity * s * s;
    const x = shot.pos.x + shot.vel.x * s;
    const z = shot.pos.z + shot.vel.z * s;
    if (y < groundAt(x, z)) break;
    out.push({ x, y, z });
  }
  return out;
}

/** True when a throw right now would pass through target `t` where it stands this instant. */
export function linedUp(feet: Vec3, yaw: number, t: Strikeable): boolean {
  const dx = t.pos.x - feet.x;
  const dz = t.pos.z - feet.z;
  const along = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const across = Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw));
  return along > 0 && across <= t.radius;
}
