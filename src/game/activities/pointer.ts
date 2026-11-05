/**
 * The arrow over Pip's head that points at where to go next, for activities that send Pip somewhere:
 * the race's next gate, the snowman's ring.
 *
 * Turned to face the camera and rolled toward the target as the camera sees it: straight up is
 * "ahead", sideways is "turn that way", down-left or down-right is "behind you, come round that way"
 * (never plain down). It shrinks as the target comes close, when the target itself is the better pointer.
 */

import { angleDelta } from '../../core/contracts';
import type { Vec2, Vec3 } from '../../core/contracts';
import type { PlacedMarker } from './markerLooks';

/** The pointer hangs over Pip's head, nudged this far toward the target. */
const ARROW_OUT = 0.5;
const ARROW_UP = 2.3;
/** The pointer leans at most this far (radians) from up. */
const ARROW_MAX_ROLL = 2.4;

export function pointerTo(from: Vec3, target: Vec2, camYaw: number): PlacedMarker[] {
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
