/**
 * The rules of a gate course, kept pure so they can be tested without a world.
 *
 * Missing a gate never fails a race. On foot the gates count in order: the course used to count any
 * later gate and everything before it, and a runner who stumbled through the dim gate after next saw
 * the counter jump from 2 to 4 with no idea why. The pointer always shows the way back to the one
 * that was missed, so going back is a few steps, not a search. In the air (`skip`) a missed hoop is
 * still skipped: a glide cannot turn round and climb back to it.
 */

import type { Vec2 } from '../../core/contracts';

/**
 * Index of the next gate still to pass, after the player has been at `pos`.
 *
 * `heights` (absolute y per gate) makes the test three-dimensional for gates hung in the air: a hoop
 * is only flown through within `band` of its height, so walking underneath one does not count.
 * `skip` lets a later gate count everything before it; without it only gate `next` can be passed.
 */
export function advanceGates(
  next: number, pos: Vec2 & { y?: number }, gates: readonly Vec2[], radius: number,
  heights?: readonly number[], band = 3, skip = false,
): number {
  const last = skip ? gates.length - 1 : Math.min(next, gates.length - 1);
  for (let i = last; i >= next; i--) {
    if (Math.hypot(pos.x - gates[i].x, pos.z - gates[i].z) > radius) continue;
    const h = heights?.[i];
    if (h !== undefined && pos.y !== undefined && Math.abs(pos.y - h) > band) continue;
    return i + 1;
  }
  return next;
}

/** Heading a runner arrives at gate `i` with: from the gate before it, or from the start post. */
export function gateYaw(start: Vec2, gates: readonly Vec2[], i: number): number {
  const from = i === 0 ? start : gates[i - 1];
  const to = gates[i];
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Course length through every gate in order, start post first. */
export function courseLength(start: Vec2, gates: readonly Vec2[]): number {
  let total = 0;
  let from = start;
  for (const g of gates) {
    total += Math.hypot(g.x - from.x, g.z - from.z);
    from = g;
  }
  return total;
}
