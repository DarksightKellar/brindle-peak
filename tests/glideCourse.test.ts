/**
 * The Thermal Descent flown with the real player stepper over the real summit: a glide has to be
 * steered. Critic round 25 flew 8 of 8 holding forward, so the hoops were set off the line, left and
 * right in turn. A glide steering for each hoop (and flapping when under 2.5 u up) threads them all;
 * one aimed at the first hoop and held straight on misses most.
 */

import { describe, expect, it } from 'vitest';
import { createSampler, generateHeightfield } from '../src/core/terrain/heightfield';
import { PEAK, WORLD_RES, WORLD_SEED, WORLD_SIZE, ZONES } from '../src/data/zones';
import { ACTIVITIES } from '../src/data/activities';
import { createPlayerState, emptyInput } from '../src/core/contracts';
import type { PlayerEnvironment } from '../src/core/contracts';
import { stepPlayer } from '../src/core/player/step';
import { TUNING } from '../src/core/player/tuning';
import { RACE_COURSES } from '../src/game/activities/raceCourses';
import { advanceGates } from '../src/game/activities/raceGates';

const sampler = createSampler(generateHeightfield(WORLD_SEED, WORLD_SIZE, WORLD_RES, ZONES, PEAK), ZONES);
const env: PlayerEnvironment = { terrain: sampler, abilities: { sprint: true, sled: false, lantern: true }, gusting: false };
const course = RACE_COURSES['peak-thermal-flight'];
const post = ACTIVITIES.find((a) => a.id === 'peak-thermal-flight')!.pos;
/** The hoops' vertical band, as race.ts counts them. */
const HOOP_BAND = 2.2;

/** Hoops passed: sprint 8 u toward the first, jump, then glide, steering for each hoop or not. */
function fly(steer: boolean): number {
  const s = createPlayerState({ x: post.x, y: sampler.heightAt(post.x, post.z) + 0.02, z: post.z }, TUNING.staminaMaxBase);
  s.grounded = true;
  s.mode = 'ground';
  let next = 0, jumped = false, since = 99;
  let heading = Math.atan2(course.gates[0].x - post.x, course.gates[0].z - post.z);
  for (let f = 0; f < 60 * 40 && next < course.gates.length; f++) {
    const g = course.gates[next];
    if (steer || !jumped) heading = Math.atan2(g.x - s.pos.x, g.z - s.pos.z);
    let press = false;
    if (!jumped && Math.hypot(s.pos.x - post.x, s.pos.z - post.z) > 8) press = jumped = true;
    else if (steer && jumped && since > 40 && s.pos.y - sampler.heightAt(s.pos.x, s.pos.z) < 2.5) {
      press = true;
      since = 0;
    }
    since++;
    // lookX re-resolves the held stroke against the new heading each frame, as turning the view does.
    stepPlayer(s, { ...emptyInput(heading), moveZ: 1, sprintHeld: !jumped, jumpPressed: press, jumpHeld: jumped, lookX: 1e-6 }, 1 / 60, TUNING, env);
    next = advanceGates(next, s.pos, course.gates, course.radius, course.heights, HOOP_BAND, true);
    if (jumped && s.grounded) break;
  }
  return next;
}

describe('thermal descent', () => {
  it('is threaded end to end by a glide that steers for each hoop', () => {
    expect(fly(true)).toBe(course.gates.length);
  });

  it('is not threaded by a glide held straight', () => {
    expect(fly(false)).toBeLessThan(course.gates.length);
  });
});
