/**
 * The dam's hand on its own: the stone the stream pushes off its gap, and the press that sets it.
 */

import { describe, expect, it } from 'vitest';
import { DAM, DamHand } from '../src/game/activities/damHand';

const FRAME = 1 / 60;

describe('dam hand', () => {
  it('a press a reaction after the stone slides off its gap still sets it (critic round 38)', () => {
    const run = (late: number): boolean => {
      const hand = new DamHand();
      let now = 0;
      hand.reset(now);
      // Hold against the current (A, upstream) until the stone is over its gap.
      for (let i = 0; i < 600 && !hand.over(); i++) hand.update((now += FRAME), FRAME, false, -1);
      expect(hand.over()).toBe(true);
      // Let go: the current carries it off the gap.
      for (let i = 0; i < 600 && hand.over(); i++) hand.update((now += FRAME), FRAME, false, 0);
      expect(hand.over()).toBe(false);
      for (let t = FRAME; t < late; t += FRAME) hand.update((now += FRAME), FRAME, false, 0);
      return hand.update((now += FRAME), FRAME, true, 0);
    };
    expect(run(DAM.react * 0.6)).toBe(true);
    expect(run(DAM.react + 0.3)).toBe(false);
  });
});
