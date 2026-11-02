/**
 * Which errand the line under the goal names: the tracked one.
 *
 * Critic round 3 found side goals nearly invisible. The line named an errand only while its step was
 * near or for twenty seconds after it appeared, so it faded while the player was still working out where
 * the warm pool was, and Ivy, Gus's bell and Tuck's hand-off took trial and error. Now one errand is
 * tracked and its line stays: the errand most recently handed over or moved on a step, until it is done.
 * With none tracked (a resumed save, or the tracked one just finished) the nearest live errand is taken
 * up. A different errand's step right beside Pip (`NEAR_HERE`) is named while Pip stands there, then the
 * line goes back to the tracked one.
 *
 * The earlier complaint still holds (six "go to X" lines read as homework), so it is one line for one
 * errand and the rest wait in the journal. With no errand live at all, unexplored ground is named only
 * when it is near (core/guide/nextStep.ts `worthShowing`).
 *
 * "Moved on" is tracked per step, across every live errand. Steps already live when the run loads are
 * not news, so a resumed save starts on the nearest errand rather than whichever the table lists last.
 */

import type { GameState, Vec2 } from '../../core/contracts';
import type { GuideContent, GuideStep } from '../../core/guide/nextStep';
import { nextStepFor, nextStepOf, worthShowing } from '../../core/guide/nextStep';

/** A different errand's step this close is named over the tracked one while Pip is there. */
export const NEAR_HERE = 30;

export interface ErrandLine {
  /** The step to print, or null for no line. Moves the tracking on; call once a frame. */
  pick(s: GameState, from: Vec2): GuideStep | null;
  /** What the last `pick` returned: for a reader (the map) that must not move the tracking. */
  current(): GuideStep | null;
}

/**
 * One line per guide table, shared by the HUD and the map, so the compass mark, the world gem and the
 * map's errand pin always name the same step.
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

export function createErrandLine(guide: GuideContent): ErrandLine {
  const seen = new Set<string>();
  /** A one-quest view of the table per errand, built once, so a frame allocates nothing. */
  const single = new Map<string, GuideContent>();
  let seeded = false;
  let tracked: string | null = null;
  let last: GuideStep | null = null;

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
      for (const def of guide.quests) {
        if (def.main === true) continue;
        const now = nextStepOf(def, s);
        if (!now) {
          if (tracked === def.id) tracked = null;
          continue;
        }
        const key = `${def.id}:${now.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (seeded) tracked = def.id; // handed over, or moved on: this is the one being worked on
      }
      seeded = true;

      const nearest = nextStepFor(s, from, guide, 'side');
      if (tracked === null && nearest?.kind === 'quest') tracked = nearest.questId;
      const mine = tracked === null ? null : stepOf(tracked, s, from);
      const mineHere = mine?.distance !== null && mine?.distance !== undefined && mine.distance <= NEAR_HERE;
      const other = nearest?.kind === 'quest' && nearest.questId !== tracked && nearest.distance !== null
        && nearest.distance <= NEAR_HERE;
      if (other && !mineHere) last = nearest;
      else if (mine) last = mine;
      else last = worthShowing(nearest, Number.POSITIVE_INFINITY) ? nearest : null;
      return last;
    },
    current: () => last,
  };
}
