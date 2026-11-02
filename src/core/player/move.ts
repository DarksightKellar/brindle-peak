import type { InputFrame, PlayerState } from '../contracts';

/**
 * World-space movement direction, latched for as long as the input stroke is held.
 *
 * Rotating the input by the live camera yaw every frame makes the player's path a function of the
 * camera, and the camera is a function of the player's facing — a loop. It has already cost this
 * project two bugs: a full circle while strafing, and, after the camera was given a gentle follow,
 * a permanent drift to the right while holding W (reported from play: "moving straight isn't really
 * straight, it goes in a gentle curve towards the right").
 *
 * Latching breaks the loop. The direction is resolved once, when the keys change or when the player
 * turns the camera themselves (`lookX`), and then held in world space. The camera may swing wherever
 * it likes; the bird keeps walking the line it started on.
 */
interface MoveLatch { mx: number; mz: number; x: number; z: number }
const latched = new WeakMap<PlayerState, MoveLatch>();

/** Camera-space input rotated into world space; length clamped to 1. */
export const toWorld = (input: InputFrame, s: PlayerState): { x: number; z: number; mag: number } => {
  const len = Math.hypot(input.moveX, input.moveZ);
  if (len <= 1e-6) {
    latched.delete(s); // released: the next press resolves against wherever the camera is now
    return { x: 0, z: 0, mag: 0 };
  }
  const mag = Math.min(1, len);
  const prev = latched.get(s);
  const sameStroke = prev !== undefined
    && Math.abs(prev.mx - input.moveX) < 1e-6 && Math.abs(prev.mz - input.moveZ) < 1e-6;
  const steering = Math.abs(input.lookX) > 1e-9;
  if (sameStroke && prev && !steering) return { x: prev.x, z: prev.z, mag };

  const sy = Math.sin(input.camYaw);
  const cy = Math.cos(input.camYaw);
  // right = forward x up = (-cos, sin). The sign of the strafe term was flipped here, so A and D were
  // mirrored: holding D walked left. Forward was covered by a test and strafe was not, which is how it
  // survived 221 green tests and was reported by a player within seconds.
  const x = sy * input.moveZ - cy * input.moveX;
  const z = cy * input.moveZ + sy * input.moveX;
  const dir = Math.hypot(x, z) || 1;
  const out = { x: (x / dir) * mag, z: (z / dir) * mag };
  latched.set(s, { mx: input.moveX, mz: input.moveZ, x: out.x, z: out.z });
  return { ...out, mag };
};

