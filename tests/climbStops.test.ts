/**
 * The stops on the climb (critic round 72): the bench's thought follows the story, and the feather on
 * the rime rock's ledge is taken by a hop up to it, not by walking past underneath.
 */

import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/core/contracts';
import { SEATS } from '../src/data/seats';
import { PICKUPS } from '../src/data/pickups';
import { inPickupRange, LEDGE_REACH } from '../src/game/session/interact';

describe('the bench by the pond', () => {
  const bench = SEATS.find((s) => s.id === 'pond-bench');

  it('thinks something different at each part of the story', () => {
    expect(bench).toBeDefined();
    const s = createGameState({ x: 0, y: 0, z: 0 }, 6);
    const seen = new Set<string>();
    const stages: [string, 'active' | 'complete'][] = [
      ['the-climb', 'active'], ['the-climb', 'complete'], ['the-mast', 'complete'], ['nana-home', 'complete'],
    ];
    seen.add(bench!.thought(s).join(' '));
    for (const [id, status] of stages) {
      s.quests[id] = { status, step: 0 } as never;
      seen.add(bench!.thought(s).join(' '));
    }
    expect(seen.size).toBe(5);
  });
});

describe('the feather on the ledge', () => {
  const ledge = PICKUPS.find((p) => p.lift !== undefined);

  it('is not taken from the snow beside it, and is taken in a hop', () => {
    expect(ledge).toBeDefined();
    const p = ledge!;
    const ground = 50;
    const beside = { x: p.pos.x + 0.5, y: ground, z: p.pos.z };
    expect(inPickupRange(beside, p, ground)).toBe(false);
    const hop = { ...beside, y: ground + p.lift! - LEDGE_REACH + 0.1 };
    expect(inPickupRange(hop, p, ground)).toBe(true);
  });
});
