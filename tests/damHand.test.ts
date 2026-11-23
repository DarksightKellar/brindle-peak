/**
 * The dam's hand on its own: the stone the stream pushes off its gap, and the press that sets it.
 */

import { describe, expect, it } from 'vitest';
import { DAM, DamHand } from '../src/game/activities/damHand';

const FRAME = 1 / 60;

describe('dam hand', () => {
  it('a stone steered over its gap catches there and waits to be set (critic round 77)', () => {
    const hand = new DamHand();
    let now = 0;
    hand.reset(now);
    // Hold against the current (upstream) until the stone catches.
    for (let i = 0; i < 600 && !hand.over(); i++) hand.update((now += FRAME), FRAME, false, -1);
    expect(hand.over()).toBe(true);
    // Let go, and keep pushing upstream: it stays caught either way.
    for (let i = 0; i < 300; i++) hand.update((now += FRAME), FRAME, false, i < 150 ? 0 : -1);
    expect(hand.over()).toBe(true);
    expect(Math.abs(hand.off)).toBeLessThanOrEqual(DAM.gap);
    expect(hand.update((now += FRAME), FRAME, true, 0)).toBe(true);
  });

  it('a press before the stone catches loses nothing: the stone stays where it was', () => {
    const hand = new DamHand();
    let now = 0;
    hand.reset(now);
    // A short hold: part way back, not yet caught.
    for (let i = 0; i < 8; i++) hand.update((now += FRAME), FRAME, false, -1);
    const before = hand.off;
    expect(hand.update((now += FRAME), FRAME, true, -1)).toBe(false);
    expect(hand.miss(now)).toBe('off');
    expect(Math.abs(hand.off - before)).toBeLessThan(0.1);
    for (let i = 0; i < 600 && !hand.over(); i++) hand.update((now += FRAME), FRAME, false, -1);
    expect(hand.update((now += FRAME), FRAME, true, 0)).toBe(true);
  });
});
