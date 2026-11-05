/**
 * Noticing something to do nearby.
 *
 * Critic round 5 climbed past the kite and the chimney race and never found either. They stand on the
 * ridge top 35 to 40 units off the trail, above the chase camera's view, so nothing on screen, gem or
 * start post, could show them. The line under the goal can: the first time a thing not yet done comes
 * within NOTICE_RANGE, it is named there for a few seconds with its bearing, the way the first feather
 * is (hudFeather.ts). Each is named once per visit; the map keeps the rest. Since round 7 the other live
 * errands are named the same way, so the five a critic carried were not all hidden behind the one followed.
 */

import type { ActivityDef, GameState, Vec2 } from '../../core/contracts';
import { compassWord, formatDistance } from '../../core/guide/compass';

/** A thing to do nearer than this is worth naming, in world units. */
export const NOTICE_RANGE = 60;
/** How long the line stays, in ms. */
export const NOTICE_MS = 12000;

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

/** A thing the line can name: an activity, or another errand's next place (errandLine.ts `others`). */
export interface Notable {
  id: string;
  /** What the line says before the bearing, e.g. "Snowman nearby" or "Errand nearby: Four Loaves". */
  label: string;
  pos: Vec2;
}

/**
 * Further than this from a named thing and it is forgotten, so coming back names it again. Named once a
 * run, a thing passed on the way somewhere else was never named again when Pip came back for it.
 */
const FORGET_RANGE = NOTICE_RANGE * 2;

export function createNearbyNotice(activities: readonly ActivityDef[]): {
  update(s: GameState, from: Vec2, nowMs: number, extra?: readonly Notable[]): string;
} {
  const named = new Map<string, Vec2>();
  let current: Notable | null = null;
  let until = -1;

  const line = (n: Notable, from: Vec2, d: number): string =>
    `${n.label} — ${compassWord(n.pos.x - from.x, n.pos.z - from.z)}, ${formatDistance(d)}`;

  return {
    update(s, from, nowMs, extra = []): string {
      for (const [id, at] of named) if (Math.hypot(at.x - from.x, at.z - from.z) > FORGET_RANGE) named.delete(id);
      if (current && nowMs < until) {
        const d = Math.hypot(current.pos.x - from.x, current.pos.z - from.z);
        if (d < 4) return '';
        // A map hop carries Pip hundreds of units inside the line's few seconds: "nearby, 773 u".
        if (d <= NOTICE_RANGE) return line(current, from, d);
      }
      current = null;
      const things: Notable[] = activities
        .filter((a) => (s.counters[`activity:${a.id}`] ?? 0) === 0)
        // Says what Pip would do there: critic round 25 read "Snowman nearby" and looked for a snowman.
        .map((a) => ({ id: `activity:${a.id}`, label: a.what ? `${a.name} nearby: ${a.what}` : `${a.name} nearby`, pos: a.pos }));
      for (const n of [...things, ...extra]) {
        if (named.has(n.id)) continue;
        const d = Math.hypot(n.pos.x - from.x, n.pos.z - from.z);
        if (d < NOTICE_RANGE && d >= 4) {
          named.set(n.id, n.pos);
          current = n;
          until = nowMs + NOTICE_MS;
          return line(n, from, d);
        }
      }
      return '';
    },
  };
}
