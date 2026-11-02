/**
 * Achievement unlocking — pure data listeners, no per-achievement code.
 *
 * `GameState.achievements` maps id -> unlock order. The order is the key count at unlock time,
 * which is monotonic and reproducible: no clock, no randomness, so a replay of the same inputs
 * produces the same journal ordering. Locked achievements are simply absent from the map.
 *
 * `check` is idempotent by construction — an id already present is never returned again, so the
 * caller can run it after every event without risking duplicate toasts.
 */

import type { AchievementDef, GameState } from '../contracts';
import { evaluate } from './conditions';

export interface AchievementEngine {
  /** Ids newly unlocked on this call, in definition order. Writes them into `s.achievements`. */
  check(s: GameState): string[];
}

export function createAchievementEngine(defs: readonly AchievementDef[]): AchievementEngine {
  return {
    check(s: GameState): string[] {
      const unlocked: string[] = [];
      for (const def of defs) {
        if (s.achievements[def.id] !== undefined) continue;
        if (!evaluate(def.trigger, s)) continue;
        s.achievements[def.id] = Object.keys(s.achievements).length;
        unlocked.push(def.id);
      }
      return unlocked;
    },
  };
}

/** Grant an achievement directly (quest rewards, scripted story beats) with the same ordering. */
export function grantAchievement(s: GameState, id: string): boolean {
  if (s.achievements[id] !== undefined) return false;
  s.achievements[id] = Object.keys(s.achievements).length;
  return true;
}
