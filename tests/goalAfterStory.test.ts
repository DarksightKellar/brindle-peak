/** After the story the goal sends Pip to someone not yet met (critic round 26 came home to "Wander"). */

import { describe, expect, it } from 'vitest';
import type { GuideContent } from '../src/core/guide/nextStep';
import { goalTarget, unmetAfterStory } from '../src/core/guide/goal';
import { goalLine } from '../src/game/ui/hudText';
import { ZONE_NAMES } from '../src/data/zoneNames';
import { fresh, questDef, step } from './progressFixtures';

const guide: GuideContent = {
  quests: [questDef({ id: 'story', title: 'The Story', main: true, giver: 'nana', steps: [step({ kind: 'activity', id: 'far-off' })] })],
  npcs: [
    { id: 'nana', zone: 'hearth', pos: { x: 0, z: 0 }, name: 'Nana' },
    { id: 'orla', zone: 'hamlet', pos: { x: 300, z: 0 }, name: 'Orla' },
    { id: 'fen', zone: 'pinewind', pos: { x: 100, z: 0 }, name: 'Fen' },
  ],
  activities: [], zones: [], places: [], zoneNames: ZONE_NAMES,
};

describe('the goal after the story', () => {
  it('says nothing while the story runs', () => {
    const s = fresh();
    s.talked.nana = true;
    s.quests.story = { status: 'active', step: 0 };
    expect(unmetAfterStory(s, { x: 0, z: 0 }, guide)).toBeNull();
  });

  it('points at the nearest villager never spoken to, then the next, then nobody', () => {
    const s = fresh();
    s.talked.nana = true;
    s.quests.story = { status: 'complete', step: 1 };
    expect(goalTarget(s, { x: 0, z: 0 }, guide)).toEqual({ x: 100, z: 0 });
    expect(goalLine(s, null, { name: 'Fen', zone: ZONE_NAMES.pinewind })).toBe(`Go and say hello to Fen, in ${ZONE_NAMES.pinewind}.`);
    // With an errand under way, the line names it before the hello (critic round 40).
    s.quests.errand = { status: 'active', step: 0 };
    expect(goalLine(s, null, { name: 'Fen', zone: ZONE_NAMES.pinewind })).toBe(`After your errands, say hello to Fen, in ${ZONE_NAMES.pinewind}.`);
    delete s.quests.errand;
    // Following a thing to try from the journal, the line names it before the hello (critic round 127).
    expect(goalLine(s, null, { name: 'Fen', zone: ZONE_NAMES.pinewind }, true)).toBe(`Once you've had a go, say hello to Fen, in ${ZONE_NAMES.pinewind}.`);
    s.talked.fen = true;
    expect(unmetAfterStory(s, { x: 0, z: 0 }, guide)?.id).toBe('orla');
    s.talked.orla = true;
    expect(goalTarget(s, { x: 0, z: 0 }, guide)).toBeNull();
    expect(goalLine(s, null, null)).toBe("The valley's talking again. Wander, or see your errands through.");
  });

  // Critic round 27 watched the line flick between Margit, Skiff and Corm as it walked the Reach.
  it('keeps the villager it named until another is at hand', () => {
    const s = fresh();
    s.talked.nana = true;
    s.quests.story = { status: 'complete', step: 1 };
    expect(unmetAfterStory(s, { x: 180, z: 0 }, guide)?.id).toBe('fen');
    // Orla is now a little nearer than Fen: the line stays on Fen.
    expect(unmetAfterStory(s, { x: 210, z: 0 }, guide)?.id).toBe('fen');
    // Orla is far nearer, but not at hand: walking between zones, the line keeps one name (critic round 42).
    expect(unmetAfterStory(s, { x: 240, z: 0 }, guide)?.id).toBe('fen');
    // Beside Orla with Fen far off (arrived by the map), the line names Orla (critic round 75 was sent
    // 499 u back to Pinewind from the hamlet), and keeps her, even walking back toward Fen.
    expect(unmetAfterStory(s, { x: 299, z: 0 }, guide)?.id).toBe('orla');
    expect(unmetAfterStory(s, { x: 210, z: 0 }, guide)?.id).toBe('orla');
    s.talked.orla = true;
    expect(unmetAfterStory(s, { x: 299, z: 0 }, guide)?.id).toBe('fen');
  });
});

describe('the lantern sentence on the climb', () => {
  // Critic round 137 read it the whole way up, the long top line of three over the compass.
  it('rides along until two posts have lit, then goes', () => {
    const s = fresh();
    s.abilities.lantern = true;
    s.zone = 'hearth';
    const main = { stepText: 'Take the batteries to Edda.', zone: 'peak' } as unknown as Parameters<typeof goalLine>[1];
    expect(goalLine(s, main)).toBe('Take the batteries to Edda. The lantern posts mark the way up.');
    s.counters['lantern'] = 1;
    expect(goalLine(s, main)).toBe('Take the batteries to Edda. The lantern posts mark the way up.');
    s.counters['lantern'] = 2;
    expect(goalLine(s, main)).toBe('Take the batteries to Edda.');
  });
});
