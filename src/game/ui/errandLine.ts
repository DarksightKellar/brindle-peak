/**
 * Which errand the line under the goal names: the tracked one.
 *
 * Critic round 3 found side goals nearly invisible, so one errand is tracked and its line stays until it
 * is done. Critic round 4 then watched the line swap under them: accepting a second errand took it over,
 * an errand started by idle chatter took it over again, and a step of a third errand a few metres away
 * was named "while you stand there" until the race they had chosen was never shown again. So:
 *
 *  - The player can pick (`track`, from the journal's Quests page). A picked errand is kept, across
 *    reloads, until it is done; nothing else takes the line from it.
 *  - With nothing picked, the errand most recently handed over or moved on a step is tracked. That is
 *    the one being worked on, and it is the player's own action that moved it.
 *  - When the tracked errand finishes, the nearest live one is taken up.
 *  - No other errand is ever named over the tracked one. The others wait in the journal.
 *
 * The earlier complaint still holds (six "go to X" lines read as homework), so it is one line for one
 * errand. With no errand live at all, unexplored ground is named only when it is near (core/guide/
 * nextStep.ts `worthShowing`).
 *
 * "Moved on" is tracked per step, across every live errand. Steps already live when the run loads are
 * not news, so a resumed save starts on the picked errand, else the nearest.
 */

import type { GameState, Vec2 } from '../../core/contracts';
import type { GuideContent, GuideStep } from '../../core/guide/nextStep';
import { nextStepFor, nextStepOf, worthShowing } from '../../core/guide/nextStep';

/** The save flag that remembers the player's pick: `track:<questId>`. At most one is set. */
const PIN = 'track:';

export interface ErrandLine {
  /** The step to print, or null for no line. Moves the tracking on; call once a frame. */
  pick(s: GameState, from: Vec2): GuideStep | null;
  /** What the last `pick` returned: for a reader (the map) that must not move the tracking. */
  current(): GuideStep | null;
  /** The errand being followed, picked or not; null when none is. */
  trackedId(): string | null;
  /** The player picks `id` to follow. Picking the one already picked lets it go. */
  track(s: GameState, id: string): void;
}

/**
 * One line per guide table, shared by the HUD, the map and the journal, so the compass mark, the world
 * gem, the map's errand pin and the journal's mark always name the same step.
 */
const lines = new WeakMap<GuideContent, ErrandLine>();
export function errandLineFor(guide: GuideContent): ErrandLine {
  let line = lines.get(guide);
  if (!line) {
    line = createErrandLine(guide);
    lines.set(guide, line);
  }
  return line;
}

/** The errand the save says the player picked, if any. */
function pinnedIn(s: GameState): string | null {
  for (const key in s.flags) if (key.startsWith(PIN) && s.flags[key] === true) return key.slice(PIN.length);
  return null;
}

function unpin(s: GameState): void {
  for (const key in s.flags) if (key.startsWith(PIN)) delete s.flags[key];
}

export function createErrandLine(guide: GuideContent): ErrandLine {
  const seen = new Set<string>();
  /** A one-quest view of the table per errand, built once, so a frame allocates nothing. */
  const single = new Map<string, GuideContent>();
  let seeded = false;
  let tracked: string | null = null;
  let pinned = false;
  let last: GuideStep | null = null;

  const live = (id: string, s: GameState): boolean => {
    const def = guide.quests.find((q) => q.id === id);
    return def !== undefined && def.main !== true && nextStepOf(def, s) !== null;
  };

  const stepOf = (id: string, s: GameState, from: Vec2): GuideStep | null => {
    const def = guide.quests.find((q) => q.id === id);
    if (!def || !nextStepOf(def, s)) return null;
    let only = single.get(id);
    if (!only) {
      only = { ...guide, quests: [def] };
      single.set(id, only);
    }
    return nextStepFor(s, from, only, 'side');
  };

  return {
    pick(s, from): GuideStep | null {
      if (!seeded) {
        const saved = pinnedIn(s);
        if (saved !== null && live(saved, s)) {
          tracked = saved;
          pinned = true;
        }
      }
      for (const def of guide.quests) {
        if (def.main === true) continue;
        const now = nextStepOf(def, s);
        if (!now) {
          if (tracked === def.id) {
            tracked = null;
            if (pinned) unpin(s);
            pinned = false;
          }
          continue;
        }
        const key = `${def.id}:${now.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Handed over, or moved on: this is the one being worked on, unless the player picked another.
        if (seeded && !pinned) tracked = def.id;
      }
      seeded = true;

      const nearest = nextStepFor(s, from, guide, 'side');
      if (tracked === null && nearest?.kind === 'quest') tracked = nearest.questId;
      const mine = tracked === null ? null : stepOf(tracked, s, from);
      if (mine) last = mine;
      else last = worthShowing(nearest, Number.POSITIVE_INFINITY) ? nearest : null;
      return last;
    },
    current: () => last,
    trackedId: () => tracked,
    track(s, id): void {
      if (!live(id, s)) return;
      unpin(s);
      if (pinned && tracked === id) {
        pinned = false;
        return;
      }
      s.flags[`${PIN}${id}`] = true;
      tracked = id;
      pinned = true;
    },
  };
}
