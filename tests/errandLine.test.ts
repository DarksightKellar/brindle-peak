import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/core/contracts';
import type { GuideContent } from '../src/core/guide/nextStep';
import { createErrandLine } from '../src/game/ui/errandLine';
import { ZONE_NAMES } from '../src/data/zoneNames';
import { fresh, questDef, step } from './progressFixtures';

const guide: GuideContent = {
  quests: [
    questDef({ id: 'story', title: 'The Story', main: true, steps: [step({ kind: 'activity', id: 'far-off' })] }),
    questDef({ id: 'bundle', title: 'The Bundle', steps: [step({ kind: 'activity', id: 'carry' }), step({ kind: 'activity', id: 'tell' }, 's2')] }),
    questDef({
      id: 'sounds', title: "Wren's Sounds",
      steps: [step({ kind: 'visited', id: 'kettles' }), step({ kind: 'activity', id: 'glade' }, 's2'), step({ kind: 'activity', id: 'last' }, 's3')],
    }),
    questDef({ id: 'later', title: 'Later', steps: [step({ kind: 'activity', id: 'later-1' })] }),
  ],
  npcs: [], activities: [], zones: [], places: [], zoneNames: ZONE_NAMES,
};

const take = (s: GameState, id: string): void => {
  s.quests[id] = { status: 'active', step: 0 };
};

describe('the line under the goal', () => {
  it('keeps its errand when another passes a step on its own as Pip walks by (critic round 22)', () => {
    const s = fresh();
    const line = createErrandLine(guide);
    take(s, 'sounds');
    take(s, 'bundle');
    line.pick(s, { x: 0, z: 0 });
    line.track(s, 'bundle');
    line.track(s, 'bundle'); // let the pick go again: following, not pinned
    expect(line.trackedId()).toBe('bundle');
    s.quests['sounds'].step = 1; // walking past the pools passes Wren's first step (a place visited)
    line.pick(s, { x: 0, z: 0 });
    expect(line.trackedId()).toBe('bundle');
    expect(line.switched()).toBeNull();
    s.quests['sounds'].step = 2; // a step Pip chose to do (an activity) takes the line, and says so
    line.pick(s, { x: 0, z: 0 });
    expect(line.trackedId()).toBe('sounds');
    expect(line.switched()).toBe("Wren's Sounds");
    line.pick(s, { x: 0, z: 0 });
    expect(line.switched()).toBeNull(); // said once
  });

  it('an errand just taken on takes the line from a followed thing to try (critic round 106)', () => {
    const s = fresh();
    const line = createErrandLine(guide);
    line.pick(s, { x: 0, z: 0 });
    line.track(s, 'try:pinewind-pinecone-throw');
    line.pick(s, { x: 0, z: 0 });
    expect(line.trackedId()).toBe('try:pinewind-pinecone-throw');
    take(s, 'bundle');
    line.pick(s, { x: 0, z: 0 });
    expect(line.trackedId()).toBe('bundle');
    expect(line.switched()).toBe('The Bundle');
    // A followed errand still holds against the next one taken on.
    line.track(s, 'bundle');
    take(s, 'later');
    line.pick(s, { x: 0, z: 0 });
    expect(line.trackedId()).toBe('bundle');
  });

  it('a followed thing to try picked again is let go (critic round 128)', () => {
    const s = fresh();
    const line = createErrandLine(guide);
    line.pick(s, { x: 0, z: 0 });
    line.track(s, 'try:pinewind-pinecone-throw');
    line.pick(s, { x: 0, z: 0 });
    expect(line.trackedId()).toBe('try:pinewind-pinecone-throw');
    line.track(s, 'try:pinewind-pinecone-throw');
    line.pick(s, { x: 0, z: 0 });
    expect(line.trackedId()).toBeNull();
    expect(Object.keys(s.flags).some((k) => k.startsWith('track:'))).toBe(false);
  });

  it('a talk a few steps away stands in for a far errand, then the line goes back (critic round 45)', () => {
    const far: GuideContent = {
      ...guide,
      quests: [
        questDef({ id: 'letter', title: "Pell's Letter", steps: [step({ kind: 'talked', id: 'nana' })] }),
        questDef({ id: 'bell', title: "Gus's Bell", steps: [step({ kind: 'talked', id: 'gus' })] }),
      ],
      npcs: [{ id: 'nana', zone: 'hearth', pos: { x: -600, z: 0 } }, { id: 'gus', zone: 'hamlet', pos: { x: 15, z: 0 } }],
    };
    const s = fresh();
    const line = createErrandLine(far);
    line.pick(s, { x: 0, z: 0 });
    take(s, 'letter');
    line.pick(s, { x: 0, z: 0 });
    take(s, 'bell'); // taken on far from Gus, beside Nana: the letter keeps the line (critic round 80)
    expect(line.pick(s, { x: -590, z: 0 })?.questId).toBe('letter');
    expect(line.pick(s, { x: 200, z: 0 })?.questId).toBe('letter');
    expect(line.onTheWay()).toBeNull();
    expect(line.pick(s, { x: 0, z: 0 })?.questId).toBe('bell'); // Gus 15 u off, Nana 600: a word on the way
    expect(line.onTheWay()).toBe("Gus's Bell");
    expect(line.trackedId()).toBe('letter');
    expect(line.pick(s, { x: -10, z: 0 })?.questId).toBe('bell'); // 25 u: held, no flicker at the edge
    expect(line.pick(s, { x: -40, z: 0 })?.questId).toBe('letter'); // walked on past it
    line.track(s, 'letter'); // a picked errand is never stood in for
    expect(line.pick(s, { x: 0, z: 0 })?.questId).toBe('letter');
  });

  it('picking the story clears the errand line until an errand is picked or taken on', () => {
    const s = fresh();
    const line = createErrandLine(guide);
    take(s, 'story');
    take(s, 'bundle');
    expect(line.pick(s, { x: 0, z: 0 })?.questId).toBe('bundle');
    line.track(s, 'story');
    expect(line.pick(s, { x: 0, z: 0 })).toBeNull();
    expect(line.trackedId()).toBe('story');
    take(s, 'later'); // taking a new errand on ends the story pick
    expect(line.pick(s, { x: 0, z: 0 })?.questId).toBe('later');
    line.track(s, 'story');
    line.track(s, 'bundle'); // so does picking one
    expect(line.pick(s, { x: 0, z: 0 })?.questId).toBe('bundle');
  });
});
