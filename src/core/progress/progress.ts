/**
 * The orchestrator: one game event in, `GameState` mutations plus newly-completed quests and
 * newly-unlocked achievements out.
 *
 * `data` is `unknown` on purpose. Every module that emits already holds the typed payload; this
 * layer narrows defensively instead of importing all sixteen payload shapes, so an event emitted
 * by a half-wired system (or a replayed save) cannot throw here.
 *
 * Event -> state table (the authoritative mapping; anything not listed mutates nothing):
 *   bell:collected      bells += n
 *   feather:collected   feathers = total          (the satchel count is the total, not a delta)
 *   item:gained         items[id] += n            (default 1)
 *   npc:talked          talked[id] = true
 *   zone:entered        visited[id] = true, zone = id, counters['visit:<id>'] += 1
 *   lantern:lit         lanterns[id] = 1, counters['lantern'] = the posts lit
 *   fish:caught         fish[id] += 1, counters['fish'] += 1
 *   photo:taken         photos[id] += 1, counters['photo'] += 1
 *   spring:soaked       counters['spring'] += 1, counters['spring:<id>'] += 1
 *   activity:completed  counters['activity:<id>'] += 1, and 'activity:<id>:<bonus>' with a bonus; the
 *                       first time, bells += ACTIVITY_BELLS
 *   summit:reached      flags['summit'] = true
 *   place:reached       counters['place:<id>'] += 1
 *   quest:started / quest:completed / achievement:unlocked / toast   (engine-owned, no mutation)
 *
 * Achievement rewards granted by a quest inside `advance` are folded into the returned
 * `unlockedAchievements`, so the toast layer still hears about them.
 */

import type { GameEventName, GameState, ZoneId } from '../contracts';
import { ZONE_IDS } from '../contracts';
import type { AchievementEngine } from './achievements';
import type { QuestEngine, StepPassed } from './quests';

/**
 * Bells for an activity played to its end the first time. Critic round 17 finished the toss, the kite and
 * the bell ring and saw nothing come of them: only errands and the snow ever filled the purse.
 */
export const ACTIVITY_BELLS = 5;

export interface ProgressEventOutcome {
  completedQuests: string[];
  /** Quests started by a predecessor's `then`. */
  startedQuests: string[];
  passedSteps: StepPassed[];
  unlockedAchievements: string[];
}

type Fields = Record<string, unknown>;

const fieldsOf = (data: unknown): Fields =>
  typeof data === 'object' && data !== null ? (data as Fields) : {};

const readString = (f: Fields, key: string): string | null => {
  const v = f[key];
  return typeof v === 'string' ? v : null;
};

const readNumber = (f: Fields, key: string, fallback: number): number => {
  const v = f[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
};

const isZoneId = (v: string | null): v is ZoneId =>
  v !== null && (ZONE_IDS as readonly string[]).includes(v);

const bump = (m: Record<string, number>, key: string, by = 1): void => {
  m[key] = (m[key] ?? 0) + by;
};

function mutate(s: GameState, name: GameEventName, f: Fields): void {
  switch (name) {
    case 'bell:collected':
      s.bells += Math.max(0, Math.floor(readNumber(f, 'n', 1)));
      break;
    case 'feather:collected':
      s.feathers = Math.max(0, Math.floor(readNumber(f, 'total', s.feathers)));
      break;
    case 'item:gained': {
      const id = readString(f, 'id');
      if (id !== null) bump(s.items, id, Math.max(1, Math.floor(readNumber(f, 'n', 1))));
      break;
    }
    case 'npc:talked': {
      const id = readString(f, 'id');
      if (id !== null) {
        s.talked[id] = true;
        s.talkedAt[id] = (s.talkedAt[id] ?? 0) + 1;
      }
      break;
    }
    case 'zone:entered': {
      const id = readString(f, 'id');
      if (isZoneId(id)) {
        s.visited[id] = true;
        s.zone = id;
        // A hop from the map is not a walk there: critic round 33 hopped to Pinewind Wood and Jory's
        // "walk as far as the pines for me" was done, and he thanked Pip for going.
        // Hops are counted apart, for the steps that take them (Condition.hop): critic round 45 hopped to
        // Kettle Springs with Ilsa's bundle and could never deliver it.
        bump(s.counters, (f['byMap'] === true ? 'hop:' : 'visit:') + id);
      }
      break;
    }
    case 'lantern:lit': {
      const id = readString(f, 'id');
      if (id !== null) {
        // `lit` on the event is the RUNNING TOTAL, for the "Lantern 4/12" toast. Writing it into the
        // per-id slot stored 4 on the fourth lantern (and persisted it); the journal only counted
        // keys, so the corruption never showed. The slot is a per-lantern flag, so it is always 1.
        // 'lantern' counts distinct posts, so relighting one cannot walk an achievement to twelve.
        // Counted from the posts themselves: both lighters (session.ts, interactVerb.ts) mark the post lit
        // before the event, so "+1 unless already lit" never counted, and critic round 139 read the climb's
        // lantern sentence (hudText.ts) all the way up; "Twelve Lights Up the Hill" could never unlock.
        s.lanterns[id] = 1;
        s.counters['lantern'] = Object.keys(s.lanterns).length;
      }
      break;
    }
    case 'fish:caught': {
      const id = readString(f, 'id');
      if (id !== null) {
        const first = (s.fish[id] ?? 0) === 0;
        bump(s.fish, id);
        bump(s.counters, 'fish');
        // Distinct species, not total catches. 'Six Species' was keyed on the raw count, so six
        // perch unlocked it while the journal's Fish page still read 1/6 (content audit).
        if (first) bump(s.counters, 'fish:species');
      }
      break;
    }
    case 'photo:taken': {
      const id = readString(f, 'id');
      if (id !== null) {
        bump(s.photos, id);
        bump(s.counters, 'photo');
      }
      break;
    }
    case 'spring:soaked': {
      const id = readString(f, 'id');
      bump(s.counters, 'spring');
      if (id !== null) bump(s.counters, 'spring:' + id);
      break;
    }
    case 'activity:completed': {
      const id = readString(f, 'id');
      if (id !== null && (s.counters['activity:' + id] ?? 0) === 0) s.bells += ACTIVITY_BELLS;
      if (id !== null) bump(s.counters, 'activity:' + id);
      // How it went, where that is more than done: 'activity:reach-skate-race:pond-crossed' is a full lap.
      const bonus = readString(f, 'bonus');
      if (id !== null && bonus !== null) bump(s.counters, `activity:${id}:${bonus}`);
      break;
    }
    case 'summit:reached':
      s.flags['summit'] = true;
      break;
    case 'place:reached': {
      const id = readString(f, 'id');
      if (id !== null) bump(s.counters, 'place:' + id);
      break;
    }
    case 'quest:started':
    case 'quest:completed':
    case 'achievement:unlocked':
    case 'toast':
      break;
    default: {
      // Exhaustiveness guard: an event name with no mapping fails typecheck here.
      const unreachable: never = name;
      return unreachable;
    }
  }
}

export function applyEvent(
  s: GameState,
  name: GameEventName,
  data: unknown,
  quests: QuestEngine,
  achievements: AchievementEngine,
): ProgressEventOutcome {
  mutate(s, name, fieldsOf(data));

  const before = new Set(Object.keys(s.achievements));
  const advanced = quests.advance(s);
  const unlockedAchievements = achievements.check(s);

  // Quest-reward achievements are written by `advance`, which bypasses the check engine.
  for (const id of Object.keys(s.achievements)) {
    if (!before.has(id) && !unlockedAchievements.includes(id)) unlockedAchievements.push(id);
  }

  return {
    completedQuests: advanced.completed,
    startedQuests: advanced.started,
    passedSteps: advanced.passed,
    unlockedAchievements,
  };
}
