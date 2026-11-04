import { describe, expect, it } from 'vitest';
import { advancePlayer } from '../src/game/session/playerAdvance';
import type { Collider } from '../src/core/player/collide';
import { FRAME, input, makeEnv, spawn, terrain } from './playerFixtures';

/** Footsteps heard over two seconds of holding W, from x = 0 toward +Z. */
function stepsHeard(colliders: readonly Collider[]): number {
  const player = spawn(0), env = makeEnv();
  let heard = 0, elapsed = 0;
  for (let i = 0; i < 240; i++) {
    elapsed += FRAME;
    advancePlayer({
      player, input: input({ camYaw: 0, moveZ: 1 }), dt: FRAME, elapsed, sampler: terrain,
      abilities: env.abilities, gusting: false, worldSize: 400, colliders, sfx: () => { if (i >= 120) heard++; },
    });
  }
  return heard;
}

describe('footsteps', () => {
  it('walking on open snow is heard', () => {
    expect(stepsHeard([])).toBeGreaterThan(2);
  });

  it('walking into a wall covers no ground and makes no sound', () => {
    const wall: Collider = { kind: 'box', x: 0, z: 1.5, hw: 6, hd: 0.5, yaw: 0 };
    expect(stepsHeard([wall])).toBe(0);
  });
});
