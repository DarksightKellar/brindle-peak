import { describe, expect, it } from 'vitest';
import { BREATH_WORDS, createSteepNudge, OFF_TRAIL_WORDS, STEEP_WORDS } from '../src/game/session/steepNudge';
import { wayDistance } from '../src/game/world/trail';

describe('steep nudge', () => {
  it('speaks after Pip pushes into a face too steep to climb, then keeps quiet a while', () => {
    const n = createSteepNudge();
    const said: (string | null)[] = [];
    for (let i = 0; i < 60 * 30; i++) said.push(n.update(1 / 60, 'wall', 0));
    const at = said.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    expect(said[at[0]]).toBe(STEEP_WORDS);
    expect(at[0] / 60).toBeGreaterThan(1);
    expect(at[0] / 60).toBeLessThan(2.5);
    expect(at).toHaveLength(2); // once, then again only after the quiet spell
  });

  it('says nothing to a bird that is moving, or not pushing into a steep face', () => {
    const n = createSteepNudge();
    for (let i = 0; i < 600; i++) {
      expect(n.update(1 / 60, 'wall', 3)).toBeNull();
      expect(n.update(1 / 60, null, 0)).toBeNull();
    }
  });

  // Critic round 30 held W at a climbable slope with no breath and read it as a slope W can't walk.
  it('says what is missing when the face is a climb and the breath is gone', () => {
    const n = createSteepNudge();
    let said: string | null = null;
    for (let i = 0; i < 60 * 3 && said === null; i++) said = n.update(1 / 60, 'breath', 0.1);
    expect(said).toBe(BREATH_WORDS);
  });

  // Critic round 99 was winded twice on Windscar's rock below the trail and read "push into the slope again".
  it('off the trail, a winded climb is told the trail goes round instead', () => {
    const n = createSteepNudge();
    let said: string | null = null;
    for (let i = 0; i < 60 * 3 && said === null; i++) said = n.update(1 / 60, 'breath', 0.1, true);
    expect(said).toBe(OFF_TRAIL_WORDS);
    // The critic's face, and the trail beside it.
    expect(wayDistance(205, -215)).toBeGreaterThan(8);
    expect(wayDistance(198, -231)).toBeLessThan(1);
  });
});
