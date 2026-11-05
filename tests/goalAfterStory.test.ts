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
    expect(goalLine(s, null, { name: 'Fen', zone: ZONE_NAMES.pinewind })).toBe(`The valley's talking again. Go and say hello to Fen, in ${ZONE_NAMES.pinewind}.`);
    // With an errand under way, the line names it before the hello (critic round 40).
    s.quests.errand = { status: 'active', step: 0 };
    expect(goalLine(s, null, { name: 'Fen', zone: ZONE_NAMES.pinewind })).toBe(`The valley's talking again. See your errands through, then say hello to Fen, in ${ZONE_NAMES.pinewind}.`);
    delete s.quests.errand;
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
    // Orla is at hand: the line moves to her.
    expect(unmetAfterStory(s, { x: 280, z: 0 }, guide)?.id).toBe('orla');
  });
});
