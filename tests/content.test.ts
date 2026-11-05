/**
 * Content integrity: ids, references, reachability, geometry and spacing — the content mistakes that
 * crash a conversation, dead-end a quest, or put something where the player cannot reach it.
 *
 * The geometry half is not a lint: it builds the real heightfield at the shipping seed and asks
 * the real sampler where every NPC, pickup and activity is. A position in the wrong zone, on a
 * face, or outside its band fails here rather than in the player's hands.
 */

import { PLACES } from '../src/data/places';
import { describe, expect, it } from 'vitest';
import { ZONE_IDS, type Condition, type Vec2, type ZoneId } from '../src/core/contracts';
import { createSampler, generateHeightfield } from '../src/core/terrain/heightfield';
import { PEAK, WORLD_RES, WORLD_SEED, WORLD_SIZE, ZONES } from '../src/data/zones';
import { ITEMS } from '../src/data/items';
import { FISH } from '../src/data/fish';
import { NPCS } from '../src/data/npcs';
import { DIALOGUE } from '../src/data/dialogue';
import { QUESTS } from '../src/data/quests';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { ACTIVITIES } from '../src/data/activities';
import { PICKUPS } from '../src/data/pickups';

const terrain = createSampler(generateHeightfield(WORLD_SEED, WORLD_SIZE, WORLD_RES, ZONES, PEAK), ZONES);
const band = (id: ZoneId): [number, number] => (ZONES.find((z) => z.id === id) as { elevation: [number, number] }).elevation;
/** `<zone>:<name>` — the prefix is the declared zone. */
const clusterZone = (cluster?: string): ZoneId | undefined => {
  const p = cluster?.split(':')[0] ?? '';
  return (ZONE_IDS as readonly string[]).includes(p) ? (p as ZoneId) : undefined;
};
const dupes = (ids: readonly string[]): string[] => {
  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
};
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

const lanterns = PICKUPS.filter((p) => p.kind === 'lantern');
const npcIds = new Set(NPCS.map((n) => n.id));
const itemIds = new Set(ITEMS.map((i) => i.id));
const activityIds = new Set(ACTIVITIES.map((a) => a.id));
const achievementIds = new Set(ACHIEVEMENTS.map((a) => a.id));
const questIds = new Set(QUESTS.map((q) => q.id));

/** Declared zone, gentle ground, inside the zone's elevation band plus a 25-unit tolerance. */
const checkPlacement = (label: string, zone: ZoneId, pos: Vec2): void => {
  const s = terrain.sampleAt(pos.x, pos.z);
  const [lo, hi] = band(zone);
  expect(s.zone, `${label} zone`).toBe(zone);
  expect(s.slope, `${label} slope`).toBeLessThan(0.5);
  expect(s.height, `${label} too low`).toBeGreaterThanOrEqual(lo - 25);
  expect(s.height, `${label} too high`).toBeLessThanOrEqual(hi + 25);
};

describe('ids', () => {
  it('has no duplicate ids anywhere', () => {
    for (const ids of [
      NPCS.map((n) => n.id),
      QUESTS.map((q) => q.id),
      ITEMS.map((i) => i.id),
      FISH.map((f) => f.id),
      ACHIEVEMENTS.map((a) => a.id),
      ACTIVITIES.map((a) => a.id),
      PICKUPS.map((p) => p.id),
      Object.keys(DIALOGUE),
    ]) expect(dupes(ids)).toEqual([]);
  });
});
describe('dialogue graph', () => {
  /*
   * A conversation is entered from data, never from a node-id suffix: a quest's offer/waiting/still/notYet,
   * a step's `say`, an NPC's `idle` (src/core/progress/conversation.ts). Those are the roots, each
   * paired with the NPC who must be speaking it.
   */
  const entries: { id: string; speaker: string; from: string }[] = [
    ...NPCS.map((n) => ({ id: n.idle, speaker: n.id, from: `${n.id} idle` })),
    ...QUESTS.flatMap((q) => [
      { id: q.offer, speaker: q.giver, from: `${q.id} offer` },
      { id: q.waiting, speaker: q.giver, from: `${q.id} waiting` },
      ...(q.still ? [{ id: q.still, speaker: q.giver, from: `${q.id} still` }] : []),
      ...(q.notYet ? [{ id: q.notYet, speaker: q.giver, from: `${q.id} notYet` }] : []),
      ...q.steps.flatMap((s) =>
        s.when.kind !== 'talked' ? [] : [
          ...(s.say ? [{ id: s.say, speaker: s.when.id, from: `${q.id}:${s.id}` }] : []),
          ...(s.hold ? [{ id: s.hold, speaker: s.when.id, from: `${q.id}:${s.id} hold` }] : []),
        ]),
    ]),
  ];
  it('enters every conversation at a real node spoken by the right NPC', () => {
    for (const e of entries) {
      expect(DIALOGUE[e.id], e.from).toBeDefined();
      expect(DIALOGUE[e.id].speaker, e.from).toBe(e.speaker);
    }
  });
  it('gives every talk step a say node, so the player hears what the step was for', () => {
    for (const q of QUESTS) for (const s of q.steps) {
      if (s.when.kind === 'talked') expect(s.say, `${q.id}:${s.id}`).toBeDefined();
    }
  });
  it('resolves every next and choice target, and reaches every node from an entry', () => {
    const seen = new Set<string>();
    const queue = entries.map((e) => e.id);
    while (queue.length > 0) {
      const id = queue.pop() as string;
      if (seen.has(id)) continue;
      const node = DIALOGUE[id];
      expect(node, `dangling dialogue id ${id}`).toBeDefined();
      seen.add(id);
      if (node.next) queue.push(node.next);
      for (const choice of node.choices ?? []) queue.push(choice.next);
    }
    for (const id of Object.keys(DIALOGUE)) expect(seen.has(id), `${id} is never entered`).toBe(true);
  });
  it('gives every node something to say', () => {
    for (const node of Object.values(DIALOGUE)) expect(node.lines.length, node.id).toBeGreaterThan(0);
  });
});
describe('references', () => {
  it('points every quest condition, giver, item and achievement at something real', () => {
    for (const q of QUESTS) {
      expect(npcIds.has(q.giver), q.id).toBe(true);
      expect(ZONE_IDS.includes(q.zone), q.id).toBe(true);
      if (q.reward.item) expect(itemIds.has(q.reward.item), q.id).toBe(true);
      if (q.reward.achievement) expect(achievementIds.has(q.reward.achievement), q.id).toBe(true);
      for (const cond of [...q.steps.map((s) => s.when), ...(q.requires ?? [])]) {
        const refs: Partial<Record<Condition['kind'], ReadonlySet<string>>> = {
          talked: npcIds, activity: activityIds, hasItem: itemIds, achievement: achievementIds,
        };
        const pool = refs[cond.kind];
        if (pool) expect(pool.has(cond.id), `${q.id}:${cond.id}`).toBe(true);
        if (cond.kind === 'visited') expect(ZONE_IDS.includes(cond.id as ZoneId), `${q.id}:${cond.id}`).toBe(true);
      }
    }
  });
  it('gives every NPC a part to play and every NPC quest a real owner', () => {
    // A part is an errand of their own, or a step in somebody else's: Bram gives nothing now, he is the
    // first stop on the story's way up.
    const asked = (id: string): boolean => QUESTS.some((q) => q.steps.some((s) => s.when.kind === 'talked' && s.when.id === id));
    for (const npc of NPCS) {
      expect(QUESTS.some((q) => q.giver === npc.id) || asked(npc.id), `${npc.id} has no part`).toBe(true);
    }
    for (const q of QUESTS) if (q.then) expect(questIds.has(q.then), q.id).toBe(true);
    const used = new Set([
      ...QUESTS.map((q) => q.reward.item),
      ...QUESTS.flatMap((q) => q.steps.map((s) => s.gives?.item)),
      ...QUESTS.map((q) => q.gives?.item),
    ].filter((v): v is string => Boolean(v)));
    for (const item of ITEMS) expect(used.has(item.id), `${item.id} unobtainable`).toBe(true);
  });
  it('gives every achievement a well-formed trigger whose target exists', () => {
    // 'fish:species' is distinct species, written by progress.ts on a first catch. It exists so
    // 'Six Species' cannot unlock on six perch while the journal reads 1/6.
    const counters = new Set([
      'fish', 'fish:species', 'photo', 'spring', 'lantern',
      ...ACTIVITIES.map((a) => `activity:${a.id}`),
      // Written from a run's bonus: a full skating lap, not any run that ended (critic round 18 fell at 3 s).
      'activity:reach-skate-race:pond-crossed',
      ...PLACES.map((p) => `place:${p.id}`),
    ]);
    for (const a of ACHIEVEMENTS) {
      const t = a.trigger;
      expect(a.icon.length, a.id).toBeGreaterThan(4);
      if (t.kind === 'visited') expect(ZONE_IDS.includes(t.id as ZoneId), a.id).toBe(true);
      else if (t.kind === 'talked') expect(npcIds.has(t.id), a.id).toBe(true);
      else if (t.kind === 'hasItem') expect(itemIds.has(t.id), a.id).toBe(true);
      else if (t.kind === 'activity') expect(activityIds.has(t.id), a.id).toBe(true);
      else if (t.kind === 'achievement') expect(achievementIds.has(t.id), a.id).toBe(true);
      else if (t.kind === 'quest') expect(questIds.has(t.id), a.id).toBe(true);
      else if (t.kind === 'count') expect(counters.has(t.id), `${a.id} counts unwritten key ${t.id}`).toBe(true);
      // 'summit' is set by summit:reached, which fires inside 16 u of the mast. The achievement used
      // to key on `visited: peak` instead, so it unlocked on crossing the zone border ~26 u short.
      else if (t.kind === 'flag') expect(['summit'].includes(t.id), `${a.id} relies on unwritten flag ${t.id}`).toBe(true);
      else throw new Error(`${a.id} relies on a trigger kind nothing writes`);
    }
  });
});
describe('geometry against the real heightfield', () => {
  it('places every NPC in its zone, on gentle ground, inside the band', () => {
    for (const n of NPCS) checkPlacement(n.id, n.zone, n.pos);
  });
  it('places every pickup in the zone its cluster declares', () => {
    for (const p of PICKUPS) {
      const declared = clusterZone(p.cluster);
      expect(declared, `${p.id} cluster`).toBeDefined();
      checkPlacement(p.id, declared as ZoneId, p.pos);
    }
  });
  it('places every activity in its declared zone on gentle ground', () => {
    for (const a of ACTIVITIES) checkPlacement(a.id, a.zone, a.pos);
  });
  it('orders the lantern chain from the station toward the summit', () => {
    const spawnY = terrain.sampleAt(-360, 360).height;
    expect(Math.abs(terrain.sampleAt(lanterns[0].pos.x, lanterns[0].pos.z).height - spawnY)).toBeLessThan(6);
    const last = lanterns[lanterns.length - 1];
    expect(terrain.sampleAt(last.pos.x, last.pos.z).height).toBeGreaterThan(40);
  });
});
describe('spacing', () => {
  it('spreads pickups 2.5 apart and NPCs 4 apart', () => {
    for (let i = 0; i < PICKUPS.length; i++) {
      for (let j = i + 1; j < PICKUPS.length; j++) {
        expect(dist(PICKUPS[i].pos, PICKUPS[j].pos), `${PICKUPS[i].id}/${PICKUPS[j].id}`).toBeGreaterThanOrEqual(2.5);
      }
    }
    for (let i = 0; i < NPCS.length; i++) {
      for (let j = i + 1; j < NPCS.length; j++) {
        expect(dist(NPCS[i].pos, NPCS[j].pos), `${NPCS[i].id}/${NPCS[j].id}`).toBeGreaterThanOrEqual(4);
      }
    }
  });
});
describe('unfinished text', () => {
  const bad = ['lorem', 'todo', 'placeholder', 'writer'];
  const allText = [
    ...Object.values(DIALOGUE).flatMap((n) => n.lines),
    ...QUESTS.flatMap((q) => [q.title, q.blurb, ...q.steps.map((s) => s.text)]),
    ...ACHIEVEMENTS.flatMap((a) => [a.name, a.desc]),
    ...ITEMS.flatMap((i) => [i.name, i.desc]),
  ];

  it('ships no empty or placeholder text', () => {
    for (const text of allText) {
      expect(text.trim().length, text).toBeGreaterThan(0);
      for (const token of bad) expect(text.toLowerCase().includes(token), text).toBe(false);
    }
  });
});
