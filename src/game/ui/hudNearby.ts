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
import { bearing } from './hudCompass';

/** Within this of straight ahead, a thing is "ahead", radians. */
const AHEAD = 0.35;

/**
 * Which way a thing lies against the view, in the goal line's words. Critic round 50 read "southwest,
 * 43 u" with a camera-relative walk and circled the snowman, the bell and a fishing post.
 */
export function viewWay(dx: number, dz: number, viewYaw: number): string {
  const rel = bearing(dx, dz, viewYaw);
  const side = rel > 0 ? 'right' : 'left';
  if (Math.abs(rel) <= AHEAD) return 'ahead';
  if (Math.abs(rel) <= Math.PI / 2) return `on your ${side}`;
  return `behind you, to your ${side}`;
}

/** A thing to do nearer than this is worth naming, in world units. */
export const NOTICE_RANGE = 60;
/** How long the line stays, in ms. */
export const NOTICE_MS = 12000;

/**
 * Every thing to do within NOTICE_RANGE and not yet done, nearest first, for the compass strip. The line
 * names each once for a few seconds; critic round 6 overshot the deer run after its line had gone and
 * had nothing left on screen to turn back to. The strip keeps them while they are near.
 */
/**
 * The strip shows things to do from further off than the line names them. Critic round 76 read "Steam
 * Columns, 44 u" in the journal and twice walked the wrong way at it: at 60 u the strip's mark came too
 * late to steer by.
 */
export const TODO_RANGE = 100;

export function nearbyTodo(activities: readonly ActivityDef[], s: GameState, from: Vec2): Vec2[] {
  return activities
    .filter((a) => (s.counters[`activity:${a.id}`] ?? 0) === 0)
    .map((a) => ({ a, d: Math.hypot(a.pos.x - from.x, a.pos.z - from.z) }))
    .filter((e) => e.d < TODO_RANGE && e.d > 3)
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
  /** `viewYaw`: the camera's, so the way is said against the view; without it, a compass word. */
  update(s: GameState, from: Vec2, nowMs: number, extra?: readonly Notable[], viewYaw?: number): string;
} {
  const named = new Map<string, Vec2>();
  let current: Notable | null = null;
  let until = -1;

  let yaw: number | undefined;
  const line = (n: Notable, from: Vec2, d: number): string => {
    const dx = n.pos.x - from.x, dz = n.pos.z - from.z;
    return `${n.label} — ${yaw === undefined ? compassWord(dx, dz) : viewWay(dx, dz, yaw)}, ${formatDistance(d)}`;
  };

  return {
    update(s, from, nowMs, extra = [], viewYaw): string {
      yaw = viewYaw;
      for (const [id, at] of named) if (Math.hypot(at.x - from.x, at.z - from.z) > FORGET_RANGE) named.delete(id);
      const things: Notable[] = activities
        .filter((a) => (s.counters[`activity:${a.id}`] ?? 0) === 0)
        // Says what Pip would do there: critic round 25 read "Snowman nearby" and looked for a snowman.
        .map((a) => ({ id: `activity:${a.id}`, label: a.what ? `${a.name} nearby: ${a.what}` : `${a.name} nearby`, pos: a.pos }));
      // The nearest thing not yet named, not the first in the list: on the saddle the line named the
      // Chimney Scramble 36 u off while the cairn's flag stood 14 u ahead.
      let next: Notable | null = null;
      let nextD = Infinity;
      for (const n of [...things, ...extra]) {
        if (named.has(n.id)) continue;
        const d = Math.hypot(n.pos.x - from.x, n.pos.z - from.z);
        if (d < NOTICE_RANGE && d >= 4 && d < nextD) { next = n; nextD = d; }
      }
      if (current && nowMs < until) {
        const d = Math.hypot(current.pos.x - from.x, current.pos.z - from.z);
        // A map hop carries Pip hundreds of units inside the line's few seconds: "nearby, 773 u".
        // A thing come up much nearer than the one being named takes the line over.
        if (d < 4) return '';
        if (d <= NOTICE_RANGE && !(next && nextD < d * 0.6)) return line(current, from, d);
      }
      current = null;
      if (!next) return '';
      named.set(next.id, next.pos);
      current = next;
      until = nowMs + NOTICE_MS;
      return line(next, from, nextD);
    },
  };
}
