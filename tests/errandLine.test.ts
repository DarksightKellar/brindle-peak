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
