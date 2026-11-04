/**
 * Noticing something to do nearby.
 *
 * Critic round 5 climbed past the kite and the chimney race and never found either. They stand on the
 * ridge top 35 to 40 units off the trail, above the chase camera's view, so nothing on screen, gem or
 * start post, could show them. The line under the goal can: the first time a thing not yet done comes
 * within NOTICE_RANGE, it is named there for a few seconds with its bearing, the way the first feather
 * is (hudFeather.ts). Each is named once a run; the map keeps the rest.
 */

import type { ActivityDef, GameState, Vec2 } from '../../core/contracts';
import { compassWord, formatDistance } from '../../core/guide/compass';

/** A thing to do nearer than this is worth naming, in world units. */
export const NOTICE_RANGE = 60;
/** How long the line stays, in ms. */
export const NOTICE_MS = 7000;

/**
 * Every thing to do within NOTICE_RANGE and not yet done, nearest first, for the compass strip. The line
 * names each once for a few seconds; critic round 6 overshot the deer run after its line had gone and
 * had nothing left on screen to turn back to. The strip keeps them while they are near.
 */
export function nearbyTodo(activities: readonly ActivityDef[], s: GameState, from: Vec2): Vec2[] {
  return activities
    .filter((a) => (s.counters[`activity:${a.id}`] ?? 0) === 0)
    .map((a) => ({ a, d: Math.hypot(a.pos.x - from.x, a.pos.z - from.z) }))
    .filter((e) => e.d < NOTICE_RANGE && e.d > 3)
    .sort((x, y) => x.d - y.d)
    .map((e) => e.a.pos);
}

export function createNearbyNotice(activities: readonly ActivityDef[]): { update(s: GameState, from: Vec2, nowMs: number): string } {
  const named = new Set<string>();
  let current: ActivityDef | null = null;
  let until = -1;

  return {
    update(s, from, nowMs): string {
      if (current && nowMs < until) {
        const d = Math.hypot(current.pos.x - from.x, current.pos.z - from.z);
        if (d < 4) return '';
        return `${current.name} nearby — ${compassWord(current.pos.x - from.x, current.pos.z - from.z)}, ${formatDistance(d)}`;
      }
      current = null;
      for (const a of activities) {
        if (named.has(a.id) || (s.counters[`activity:${a.id}`] ?? 0) > 0) continue;
        if (Math.hypot(a.pos.x - from.x, a.pos.z - from.z) < NOTICE_RANGE) {
          named.add(a.id);
          current = a;
          until = nowMs + NOTICE_MS;
          return this.update(s, from, nowMs);
        }
      }
      return '';
    },
  };
}
