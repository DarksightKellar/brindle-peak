import { describe, expect, it } from 'vitest';
import type { GameEventName } from '../src/core/contracts';
import { createEventBus } from '../src/core/progress/events';
import { createQuestEngine } from '../src/core/progress/quests';
import { createAchievementEngine } from '../src/core/progress/achievements';
import { ACTIVITY_BELLS, applyEvent } from '../src/core/progress/progress';
import { achDef, fresh, questDef, step } from './progressFixtures';

describe('event bus', () => {
  it('keeps events emitted before any subscriber, and drains once', () => {
    const bus = createEventBus();
    bus.emit('bell:collected', { n: 3 });
    bus.emit('zone:entered', { id: 'pinewind' });
    expect(bus.drain()).toEqual([
      { name: 'bell:collected', data: { n: 3 } },
      { name: 'zone:entered', data: { id: 'pinewind' } },
    ]);
    expect(bus.drain()).toEqual([]);
  });
  it('notifies named and wildcard listeners, and stops after unsubscribe', () => {
    const bus = createEventBus();
    const seen: string[] = [];
    const off = bus.on('bell:collected', (e) => seen.push('named:' + e.name));
    bus.on('*', (e) => seen.push('all:' + e.name));
    bus.emit('bell:collected', { n: 1 });
    bus.emit('fish:caught', { id: 'char', isNew: true });
    off();
    bus.emit('bell:collected', { n: 1 });
    expect(seen).toEqual([
      'named:bell:collected', 'all:bell:collected', 'all:fish:caught', 'all:bell:collected',
    ]);
    expect(bus.drain()).toHaveLength(3);
  });
  it('keeps going when one listener throws', () => {
    const bus = createEventBus();
    const seen: string[] = [];
    bus.on('bell:collected', () => {
      throw new Error('bad consumer');
    });
    bus.on('bell:collected', (e) => seen.push(e.name));
    bus.on('*', (e) => seen.push('*' + e.name));
    expect(() => bus.emit('bell:collected', { n: 1 })).not.toThrow();
    expect(seen).toEqual(['bell:collected', '*bell:collected']);
    expect(bus.drain()).toHaveLength(1);
  });
});

describe('achievements', () => {
  it('unlocks once, records order, and returns [] the second time', () => {
    const s = fresh();
    const engine = createAchievementEngine([
      achDef('first-snow', { kind: 'count', id: 'bells', n: 1 }),
      achDef('summit', { kind: 'visited', id: 'peak' }),
    ]);
    expect(engine.check(s)).toEqual([]);
    s.counters['bells'] = 1;
    expect(engine.check(s)).toEqual(['first-snow']);
    expect(engine.check(s)).toEqual([]);
    s.visited['peak'] = true;
    expect(engine.check(s)).toEqual(['summit']);
    expect([s.achievements['first-snow'], s.achievements['summit']]).toEqual([0, 1]);
    expect(engine.check(s)).toEqual([]);
  });
});

describe('lamps', () => {
  it('stores a per-lantern flag, not the running total', () => {
    // The event's `lit` field is a RUNNING TOTAL for the "Lantern 4/12" toast. It used to be written
    // into the per-id slot as well, so the fourth lantern persisted as `lantern-4: 4`; the journal
    // only counted keys, so the corruption was invisible. The slot is a flag and must always be 1.
    const s = fresh();
    const engine = createQuestEngine([]);
    const achievements = createAchievementEngine([]);
    for (let i = 1; i <= 4; i++) {
      applyEvent(s, 'lantern:lit', { id: `lantern-${i}`, lit: i }, engine, achievements);
    }
    expect(s.lanterns).toEqual({
      'lantern-1': 1, 'lantern-2': 1, 'lantern-3': 1, 'lantern-4': 1,
    });
  });
});

describe('applyEvent', () => {
  it('adds bells, counts the activity, and reports the completed quest', () => {
    const s = fresh();
    const engine = createQuestEngine([
      questDef({ id: 'skater', steps: [step({ kind: 'activity', id: 'skate' })] }),
    ]);
    const achievements = createAchievementEngine([achDef('first-lap', { kind: 'activity', id: 'skate' })]);
    expect(engine.accept('skater', s)).toBe(true);

    expect(applyEvent(s, 'bell:collected', { n: 3 }, engine, achievements)).toEqual({
      completedQuests: [],
      startedQuests: [],
      passedSteps: [],
      unlockedAchievements: [],
    });
    const out = applyEvent(s, 'activity:completed', { id: 'skate', score: 9 }, engine, achievements);
    expect(s.bells).toBe(3 + ACTIVITY_BELLS); // the first go at an activity pays
    expect(s.counters['activity:skate']).toBe(1);
    expect(out.completedQuests).toEqual(['skater']);
    expect(out.unlockedAchievements).toEqual(['first-lap']);
    expect(s.quests['skater']?.status).toBe('complete');
    applyEvent(s, 'activity:completed', { id: 'skate', score: 12 }, engine, achievements);
    expect(s.bells).toBe(3 + ACTIVITY_BELLS); // and only the first
    expect(s.counters['activity:skate:pond-crossed']).toBeUndefined();
    applyEvent(s, 'activity:completed', { id: 'skate', score: 20, bonus: 'pond-crossed' }, engine, achievements);
    expect(s.counters['activity:skate:pond-crossed']).toBe(1);
  });

  it('routes the remaining event kinds and survives junk payloads', () => {
    const s = fresh();
    const quests = createQuestEngine([]);
    const achievements = createAchievementEngine([]);
    const batch: [GameEventName, unknown][] = [
      ['feather:collected', { id: 'f1', total: 4 }], ['item:gained', { id: 'bait', n: 2 }],
      ['npc:talked', { id: 'hollis' }], ['zone:entered', { id: 'pinewind' }],
      ['lantern:lit', { id: 'post-1', lit: 1 }], ['fish:caught', { id: 'char', isNew: true }],
      ['photo:taken', { id: 'mast', isNew: false }], ['spring:soaked', { id: 'kettle-1' }],
      ['spring:soaked', { id: 'kettle-1' }], ['bell:collected', { n: 'nonsense' }],
      ['npc:talked', { nothing: true }], ['zone:entered', { id: 'not-a-zone' }],
    ];
    for (const [name, data] of batch) applyEvent(s, name, data, quests, achievements);

    expect(s.feathers).toBe(4);
    expect([s.items['bait'], s.fish['char'], s.photos['mast'], s.lanterns['post-1']]).toEqual([2, 1, 1, 1]);
    expect([s.counters['fish'], s.counters['photo'], s.counters['spring']]).toEqual([1, 1, 2]);
    expect(s.counters['spring:kettle-1']).toBe(2);
    expect(s.talked['hollis']).toBe(true);
    expect([s.zone, s.visited['pinewind']]).toEqual(['pinewind', true]);
    expect(s.bells).toBe(1);
  });
});
