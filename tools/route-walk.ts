/**
 * Can the player actually WALK to the mast?
 *
 * `tests/connectivity.test.ts` proves a slope-limited flood fill reaches the peak, and every visual check
 * of the summit so far has been a teleport. Neither exercises the movement controller: the flood fill
 * ignores stamina, and a teleport ignores the climb. This harness closes that gap — it finds a route
 * with the same rule the unit test uses (`tools/lib/route.ts`), then drives the real `stepPlayer`
 * along it and reports the time, the stamina minima and whether a featherless bird can finish.
 *
 * It is a lower bound on the walk, not a playthrough: steering is perfect, there are no activities or
 * conversations, and the controller is fed forward input only. What it can detect is a climb that
 * cannot be finished, and a traversal time wildly different from the design's arithmetic.
 *
 *   npx vite-node tools/route-walk.ts
 */

import { emptyInput, createPlayerState } from '../src/core/contracts';
import type { InputFrame, PlayerState } from '../src/core/contracts';
import { stepPlayer } from '../src/core/player/step';
import { TUNING } from '../src/core/player/tuning';
import { PEAK, SPAWN } from '../src/data/zones';
import { makeSampler, pathLength, route, type Point } from './lib/route';

const sampler = makeSampler();

function walk(path: readonly Point[], feathers: number, sprint: boolean) {
  const state: PlayerState = createPlayerState(
    { x: SPAWN.x, y: sampler.heightAt(SPAWN.x, SPAWN.z) + 0.05, z: SPAWN.z },
    TUNING.staminaMaxBase + feathers,
  );
  const env = {
    terrain: sampler,
    abilities: { sprint, sled: false, lantern: false },
    gusting: false,
  };
  const DT = 1 / 60;
  const input: InputFrame = { ...emptyInput(), moveZ: 1, sprintHeld: sprint };
  let t = 0;
  let minStamina = state.stamina;
  let exhaustedFrames = 0;
  let distance = 0;

  for (let i = 0; i < path.length; i++) {
    const wp = path[i];
    let guard = 0;
    let best = Infinity;
    let stale = 0;
    while (guard++ < 60 * 240) {
      const dx = wp.x - state.pos.x;
      const dz = wp.z - state.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.2) break;
      if (d < best - 0.01) { best = d; stale = 0; } else if (++stale > 240) {
        // Four simulated seconds without closing on the waypoint: the controller cannot make this step.
        const rise = sampler.heightAt(wp.x, wp.z) - sampler.heightAt(state.pos.x, state.pos.z);
        throw new Error(
          `stuck at waypoint ${i}/${path.length} (${wp.x.toFixed(1)}, ${wp.z.toFixed(1)}): ` +
          `player at (${state.pos.x.toFixed(2)}, ${state.pos.y.toFixed(2)}, ${state.pos.z.toFixed(2)}), ` +
          `${d.toFixed(2)}u away, ground rises ${rise.toFixed(2)}u over that gap ` +
          `(slope ${(rise / Math.max(d, 0.01)).toFixed(2)})`,
        );
      }
      // Perfect steering: point the camera at the waypoint and hold forward. Movement is latched in
      // world space while the keys stay the same (core/player/move.ts) and only re-resolves when the
      // player turns the camera themselves, so the turn is reported as `lookX`, exactly as a player's
      // own camera turn would be. Setting camYaw alone walks the bird along its first heading forever.
      const yaw = Math.atan2(dx, dz);
      input.lookX = yaw - input.camYaw;
      input.camYaw = yaw;
      const before = { x: state.pos.x, z: state.pos.z };
      const r = stepPlayer(state, input, DT, TUNING, env);
      if (r.exhausted) exhaustedFrames++;
      distance += Math.hypot(state.pos.x - before.x, state.pos.z - before.z);
      minStamina = Math.min(minStamina, state.stamina);
      t += DT;
      if (t > 3600) throw new Error('route walk exceeded an hour of simulated time');
    }
  }

  const toMast = Math.hypot(PEAK.x - state.pos.x, PEAK.z - state.pos.z);
  return { seconds: t, minStamina, exhaustedFrames, distance, toMast };
}

const path = route(sampler);
const routeLength = pathLength(path);
console.log(`route: ${path.length} waypoints, ${routeLength.toFixed(0)} units of ground`);
const ground = routeLength / TUNING.sprintSpeed;

for (const [label, feathers, sprint] of [
  ['fresh save, walk', 0, false],
  ['fresh save, walk+sprint', 0, true],
  ['14 feathers, walk', 14, false],
] as Array<[string, number, boolean]>) {
  const r = walk(path, feathers, sprint);
  const mm = Math.floor(r.seconds / 60);
  const ss = Math.round(r.seconds % 60);
  console.log(
    `${label.padEnd(24)} ${String(mm).padStart(2)}m${String(ss).padStart(2)}s  ` +
    `path ${r.distance.toFixed(0)}u  min stamina ${r.minStamina.toFixed(2)}  ` +
    `exhausted frames ${r.exhaustedFrames}  ends ${r.toMast.toFixed(1)}u from mast`,
  );
}
console.log(`straight-line sprint over the same ground would be ${Math.floor(ground / 60)}m${Math.round(ground % 60)}s`);
