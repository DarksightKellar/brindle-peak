import { describe, expect, it } from 'vitest';
import type { Condition, GameState, QuestDef } from '../src/core/contracts';
import { evaluate } from '../src/core/progress/conditions';
import { createQuestEngine } from '../src/core/progress/quests';
import { createAchievementEngine } from '../src/core/progress/achievements';
import { applyEvent } from '../src/core/progress/progress';
import { load, save } from '../src/core/progress/save';
import { fresh, questDef, step, talk } from './progressFixtures';

describe('conditions', () => {
  const cases: { name: string; c: Condition; satisfy: (s: GameState) => void }[] = [
    { name: 'talked', c: { kind: 'talked', id: 'nana' }, satisfy: (s) => (s.talked['nana'] = true) },
    { name: 'hasItem', c: { kind: 'hasItem', id: 'mitten' }, satisfy: (s) => (s.items['mitten'] = 1) },
    { name: 'visited', c: { kind: 'visited', id: 'peak' }, satisfy: (s) => (s.visited['peak'] = true) },
    { name: 'count', c: { kind: 'count', id: 'bells', n: 4 }, satisfy: (s) => (s.counters['bells'] = 4) },
    { name: 'activity', c: { kind: 'activity', id: 'skate' }, satisfy: (s) => (s.counters['activity:skate'] = 1) },
    { name: 'flag', c: { kind: 'flag', id: 'lantern' }, satisfy: (s) => (s.flags['lantern'] = true) },
    { name: 'achievement', c: { kind: 'achievement', id: 'snow' }, satisfy: (s) => (s.achievements['snow'] = 0) },
    { name: 'reached', c: { kind: 'reached', id: 'pools' }, satisfy: (s) => (s.counters['place:pools'] = 1) },
  ];
  for (const k of cases) {
    it(k.name, () => {
      const s = fresh();
      expect(evaluate(k.c, s)).toBe(false);
      k.satisfy(s);
      expect(evaluate(k.c, s)).toBe(true);
    });
  }
  it('count crosses its threshold and n defaults to 1', () => {
    const s = fresh();
    s.items['mitten'] = 1;
    s.counters['bells'] = 3;
    expect(evaluate({ kind: 'count', id: 'bells', n: 4 }, s)).toBe(false);
    s.counters['bells'] = 4;
    expect(evaluate({ kind: 'count', id: 'bells', n: 4 }, s)).toBe(true);
    expect(evaluate({ kind: 'hasItem', id: 'mitten' }, s)).toBe(true);
    expect(evaluate({ kind: 'hasItem', id: 'mitten', n: 2 }, s)).toBe(false);
    expect(evaluate({ kind: 'activity', id: 'skate', n: 2 }, s)).toBe(false);
  });
});

describe('quest engine', () => {
  const twoStep = (): QuestDef[] => [
    questDef({
      id: 'mitten',
      steps: [step({ kind: 'talked', id: 'bram' }, 'a'), step({ kind: 'hasItem', id: 'mitten' }, 'b')],
      reward: { bells: 5, feathers: 1, item: 'mitten', achievement: 'kindness' },
    }),
    questDef({ id: 'gated', requires: [{ kind: 'flag', id: 'lantern' }] }),
  ];

  it('walks available -> active -> complete exactly once, paying the reward once', () => {
    const s = fresh();
    const engine = createQuestEngine(twoStep());
    engine.advance(s);
    expect(engine.status('mitten')).toBe('available');
    expect(engine.status('gated')).toBe('locked');
    expect(engine.accept('gated', s)).toBe(false);
    expect(engine.accept('mitten', s)).toBe(true);
    expect(engine.status('mitten')).toBe('active');
    expect(engine.accept('mitten', s)).toBe(false);
    expect(engine.activeIds()).toEqual(['mitten']);

    expect(engine.advance(s).completed).toEqual([]);
    talk(s, 'bram');
    expect(engine.advance(s).passed.map((p) => p.index)).toEqual([0]);
    expect(s.quests['mitten']).toEqual({ status: 'active', step: 1 });
    s.items['mitten'] = 1;
    expect(engine.advance(s).completed).toEqual(['mitten']);
    expect(engine.advance(s).completed).toEqual([]);
    expect(engine.status('mitten')).toBe('complete');
    expect(engine.activeIds()).toEqual([]);
    expect([s.bells, s.feathers, s.items['mitten'], s.achievements['kindness']]).toEqual([5, 1, 2, 0]);

    s.flags['lantern'] = true;
    engine.advance(s);
    expect(engine.status('gated')).toBe('available');
    expect(engine.accept('gated', s)).toBe(true);
  });

  /*
   * The bug behind "it already says done": a talk or visit step was satisfied by anything the player
   * had ever done. The greeting that hands a quest over, or a chat with the target an hour earlier,
   * completed it on sight. Those steps now count only what happens after they begin.
   */
  it('the greeting that hands over a quest is not the report the quest waits for', () => {
    const s = fresh();
    const engine = createQuestEngine([
      questDef({ id: 'report', steps: [step({ kind: 'talked', id: 'hollis' }, 'thanks')], reward: { bells: 3 } }),
    ]);
    talk(s, 'hollis');
    expect(engine.accept('report', s)).toBe(true);
    expect(engine.advance(s).completed).toEqual([]);
    expect(s.bells).toBe(0);
    talk(s, 'hollis');
    expect(engine.advance(s).completed).toEqual(['report']);
    expect(s.bells).toBe(3);
  });

  it('a chat from before the quest does not pass a talk step, and the same talk passes only one step', () => {
    const s = fresh();
    const engine = createQuestEngine([
      questDef({
        id: 'errand',
        steps: [
          { ...step({ kind: 'talked', id: 'bram' }, 'ask'), say: 'bram-ask' },
          { ...step({ kind: 'talked', id: 'bram' }, 'again'), say: 'bram-again', gives: { item: 'rope' } },
        ],
        reward: { bells: 1 },
      }),
    ]);
    talk(s, 'bram');
    engine.accept('errand', s);
    expect(engine.advance(s).passed).toEqual([]);
    talk(s, 'bram');
    expect(engine.advance(s).passed.map((p) => p.step.say)).toEqual(['bram-ask']);
    expect(s.items['rope']).toBeUndefined();
    talk(s, 'bram');
    const out = engine.advance(s);
    expect(out.passed.map((p) => p.step.say)).toEqual(['bram-again']);
    expect(out.completed).toEqual(['errand']);
    expect(s.items['rope']).toBe(1);
  });

  it('counts a lantern post its lighter has already marked lit, once', () => {
    // Both lighters mark the post before the event (critic round 139 found the count stuck at 0).
    const s = fresh();
    const engine = createQuestEngine([]);
    for (const id of ['a', 'b', 'a']) {
      s.lanterns[id] = 1;
      applyEvent(s, 'lantern:lit', { id, lit: Object.keys(s.lanterns).length }, engine, createAchievementEngine([]));
    }
    expect(s.counters['lantern']).toBe(2);
  });

  it('a visit step needs a fresh entry into the zone', () => {
    const s = fresh();
    const engine = createQuestEngine([questDef({ id: 'walk', steps: [step({ kind: 'visited', id: 'hearth' })] })]);
    applyEvent(s, 'zone:entered', { id: 'hearth' }, engine, createAchievementEngine([]));
    engine.accept('walk', s);
    expect(engine.advance(s).completed).toEqual([]);
    applyEvent(s, 'zone:entered', { id: 'hearth' }, engine, createAchievementEngine([]));
    expect(engine.status('walk')).toBe('complete');
  });

  it('a place step passes on arriving at the place, not on entering its zone', () => {
    const s = fresh();
    const none = createAchievementEngine([]);
    const engine = createQuestEngine([questDef({ id: 'listen', steps: [step({ kind: 'reached', id: 'pools' })] })]);
    engine.accept('listen', s);
    applyEvent(s, 'zone:entered', { id: 'kettles' }, engine, none);
    expect(engine.status('listen')).toBe('active');
    applyEvent(s, 'place:reached', { id: 'pools' }, engine, none);
    expect(engine.status('listen')).toBe('complete');
  });

  it('a talk spent on one quest leaves the other waiting for the next talk, not for any event', () => {
    // Pell's letter went to Nana in silence: the talk that finished the story's step was held back
    // from the errand, and the quest:completed it queued then passed the errand with no conversation.
    const s = fresh();
    const none = createAchievementEngine([]);
    const engine = createQuestEngine([
      questDef({ id: 'story', main: true, steps: [{ ...step({ kind: 'talked', id: 'nana' }, 'home'), say: 'nana-home' }] }),
      questDef({ id: 'letter', steps: [{ ...step({ kind: 'talked', id: 'nana' }, 'give'), say: 'nana-letter' }] }),
    ]);
    engine.accept('story', s);
    engine.accept('letter', s);
    talk(s, 'nana');
    expect(engine.advance(s).passed.map((p) => p.step.say)).toEqual(['nana-home']);
    applyEvent(s, 'bell:collected', { n: 1 }, engine, none);
    expect(engine.status('letter')).toBe('active');
    talk(s, 'nana');
    expect(engine.advance(s).passed.map((p) => p.step.say)).toEqual(['nana-letter']);
  });

  it('advances three steps in order and never past an unmet step', () => {
    const s = fresh();
    const engine = createQuestEngine([
      questDef({
        id: 'ascent',
        steps: [
          step({ kind: 'flag', id: 'one' }, 'a'),
          step({ kind: 'flag', id: 'two' }, 'b'),
          step({ kind: 'flag', id: 'three' }, 'c'),
        ],
      }),
    ]);
    expect(engine.accept('ascent', s)).toBe(true);
    s.flags['two'] = true;
    s.flags['three'] = true;
    expect(engine.advance(s).completed).toEqual([]);
    expect(s.quests['ascent']).toEqual({ status: 'active', step: 0 });
    s.flags['one'] = true;
    expect(engine.advance(s).completed).toEqual(['ascent']);
    expect(s.quests['ascent']).toEqual({ status: 'complete', step: 3 });
  });

  it('starts the next chapter the moment one finishes', () => {
    const s = fresh();
    const engine = createQuestEngine([
      questDef({ id: 'one', steps: [step({ kind: 'flag', id: 'a' })], then: 'two' }),
      questDef({ id: 'two', steps: [step({ kind: 'flag', id: 'b' })], requires: [{ kind: 'quest', id: 'one' }] }),
    ]);
    engine.accept('one', s);
    s.flags['a'] = true;
    const out = engine.advance(s);
    expect([out.completed, out.started]).toEqual([['one'], ['two']]);
    expect(engine.status('two')).toBe('active');
  });

  it('an activity done before its step counts, unless the step is fresh', () => {
    // Orla asked for a snowman after the visit to Skiff, and one built earlier had to be built again.
    const s = fresh();
    s.counters['activity:snowman'] = 1;
    const engine = createQuestEngine([
      questDef({ id: 'loaves', steps: [step({ kind: 'talked', id: 'skiff' }, 'ask'), step({ kind: 'activity', id: 'snowman' }, 'build')] }),
      questDef({ id: 'count', steps: [{ ...step({ kind: 'activity', id: 'snowman' }), fresh: true }] }),
    ]);
    engine.accept('loaves', s);
    engine.accept('count', s);
    talk(s, 'skiff');
    engine.advance(s);
    expect([engine.status('loaves'), engine.status('count')]).toEqual(['complete', 'active']);
    s.counters['activity:snowman'] = 2;
    engine.advance(s);
    expect(engine.status('count')).toBe('complete');
  });

  it('one talk passes a second step with the same person when what lay between is already done', () => {
    const s = fresh();
    s.counters['activity:pile'] = 1;
    const engine = createQuestEngine([
      questDef({
        id: 'pile',
        steps: [
          { ...step({ kind: 'talked', id: 'bram' }, 'ask'), say: 'bram-ask' },
          step({ kind: 'activity', id: 'pile' }, 'stack'),
          { ...step({ kind: 'talked', id: 'bram' }, 'paid'), say: 'bram-paid' },
        ],
      }),
    ]);
    engine.accept('pile', s);
    talk(s, 'bram');
    expect(engine.advance(s).passed.map((p) => p.step.id)).toEqual(['ask', 'stack', 'paid']);
  });

  it('hands over a quest gift on accepting, once', () => {
    const s = fresh();
    const engine = createQuestEngine([questDef({ id: 'rope', gives: { item: 'rope' } })]);
    engine.accept('rope', s);
    engine.accept('rope', s);
    expect(s.items['rope']).toBe(1);
  });

  it('resumes a loaded save, step and baseline included', () => {
    const s = fresh();
    const def = (): QuestDef[] => [questDef({ id: 'report', steps: [step({ kind: 'talked', id: 'hollis' })] })];
    talk(s, 'hollis');
    createQuestEngine(def()).accept('report', s);
    const loaded = load(save(s)) as GameState;
    const again = createQuestEngine(def());
    expect(again.advance(loaded).completed).toEqual([]);
    talk(loaded, 'hollis');
    expect(again.advance(loaded).completed).toEqual(['report']);
  });
});
