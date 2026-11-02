import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../src/core/contracts';
import { load, save } from '../src/core/progress/save';
import { fresh } from './progressFixtures';

describe('save / load', () => {
  it('round-trips a fully populated state losslessly', () => {
    const s = fresh();
    s.player = { pos: { x: 12.5, y: 33.25, z: -4 }, facing: 1.25, stamina: 2.5 };
    s.abilities = { sprint: true, sled: true, lantern: true };
    s.feathers = 7; s.bells = 42; s.playtime = 812.5; s.zone = 'ridge';
    s.checkpoint = { x: 3, y: 44, z: 9 };
    s.items['mitten'] = 1; s.counters['fish'] = 3; s.flags['summit'] = true;
    s.talked['hollis'] = true; s.visited['pinewind'] = true; s.fish['char'] = 2;
    s.photos['mast'] = 1; s.lanterns['post-9'] = 1; s.sledBests['reach-hill'] = 31.4;
    s.quests['ascent'] = { status: 'active', step: 2 };
    s.achievements['first-snow'] = 0;
    // A step's baseline has to be populated here or this test cannot see a save that forgets it.
    s.talkedAt['hollis'] = 3;
    s.quests['report'] = { status: 'active', step: 0, base: 3 };
    s.talkedAt['nana'] = 1;

    expect(load(save(s))).toEqual(s);
    expect(load(JSON.stringify({ ...s, hacked: true, player: { ...s.player, mode: 'air' } }))).toEqual(s);
  });

  it('returns null for every malformed input and never throws', () => {
    const good = JSON.parse(save(fresh())) as Record<string, unknown>;
    const bad = [
      'not json at all', '[]', 'null',
      JSON.stringify({ ...good, version: SAVE_VERSION + 1 }),
      JSON.stringify({ ...good, version: '1' }),
      JSON.stringify({ ...good, player: undefined }),
      JSON.stringify({ ...good, player: { pos: { x: 0, y: 1, z: 0 }, facing: 0 } }),
      JSON.stringify({ ...good, player: { pos: { x: 0, y: 1, z: 0 }, facing: 0, stamina: 'full' } }),
      '{"version":1,"player":{"pos":{"x":NaN,"y":1,"z":0},"facing":0,"stamina":5}}',
      save(fresh()).replace('"pos":{"x":0', '"pos":{"x":null'),
      JSON.stringify({ ...good, items: { mitten: 'one' } }),
      JSON.stringify({ ...good, quests: { q: { status: 'unknown', step: 0 } } }),
      JSON.stringify({ ...good, zone: 'atlantis' }),
      JSON.stringify({ ...good, checkpoint: { x: 0, y: 0 } }),
      JSON.stringify({ ...good, playtime: Infinity }),
    ];
    for (const json of bad) {
      expect(() => load(json)).not.toThrow();
      expect(load(json)).toBeNull();
    }
  });
});
