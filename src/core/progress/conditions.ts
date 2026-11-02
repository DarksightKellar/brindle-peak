/**
 * Condition evaluation — the single interpreter for every `ConditionKind` in the contracts.
 *
 * Quests, achievements, dialogue gating and quest `requires` all funnel through here, so a new
 * condition kind is added in exactly two places: `contracts.ts` and this switch. Nothing else in
 * `core/progress` knows what a condition means.
 *
 * Counter key conventions (the only place these strings exist):
 *   activity -> 'activity:<activityId>'   written by activity:completed
 *   visit    -> 'visit:<zoneId>'          entries into a zone, written by zone:entered
 *   fish     -> 'fish'                    total caught, written by fish:caught
 *   photo    -> 'photo'                   total taken, written by photo:taken
 *   spring   -> 'spring' and 'spring:<id>' written by spring:soaked
 *   place    -> 'place:<id>'              arrivals at a named spot, written by place:reached
 */

import type { Condition, GameState } from '../contracts';

/** A plain fact about state: has this ever been true? Achievements and `requires` use this. */
export function evaluate(c: Condition, s: GameState): boolean {
  const n = c.n ?? 1;
  switch (c.kind) {
    case 'talked':
      return s.talked[c.id] === true;
    case 'hasItem':
      return (s.items[c.id] ?? 0) >= n;
    case 'visited':
      return s.visited[c.id] === true;
    case 'count':
      return (s.counters[c.id] ?? 0) >= n;
    case 'activity':
      return (s.counters['activity:' + c.id] ?? 0) >= n;
    case 'flag':
      return s.flags[c.id] === true;
    case 'achievement':
      return s.achievements[c.id] !== undefined;
    case 'quest':
      return s.quests[c.id]?.status === 'complete';
    case 'reached':
      return (s.counters['place:' + c.id] ?? 0) >= n;
    default: {
      // Exhaustiveness guard: adding a ConditionKind without handling it fails typecheck here.
      const unreachable: never = c.kind;
      return unreachable;
    }
  }
}

/**
 * For the kinds that describe something the player *does* — talk to someone, walk into a zone, arrive
 * at a place, finish an activity — a running count; null for every kind that is a standing fact.
 *
 * A quest step of a counted kind passes when this count rises above the value it had when the step
 * began. That is the whole rule that stops "ask Pell" being satisfied by a chat from an hour ago, or
 * "take the letter to Hearth Hollow" by the spawn point.
 */
export function measure(c: Condition, s: GameState): number | null {
  switch (c.kind) {
    case 'talked':
      return s.talkedAt[c.id] ?? 0;
    case 'visited':
      return s.counters['visit:' + c.id] ?? 0;
    case 'activity':
      return s.counters['activity:' + c.id] ?? 0;
    case 'reached':
      return s.counters['place:' + c.id] ?? 0;
    default:
      return null;
  }
}

/** True when every condition holds. An absent/empty requirement list is always satisfied. */
export function allSatisfied(conditions: readonly Condition[] | undefined, s: GameState): boolean {
  if (!conditions || conditions.length === 0) return true;
  for (const c of conditions) {
    if (!evaluate(c, s)) return false;
  }
  return true;
}
