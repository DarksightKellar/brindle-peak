/**
 * The way home, lit.
 *
 * Nana gave Pip her lantern so the posts would show the way back down to her. Once Edda signs off,
 * the walk home is a thousand units with nothing left to do on it, so the trail keeps her promise:
 * the posts Pip did not light come on one by one, from the peak down toward the cabin.
 *
 * In the story it is the valley lighting them. Nana asks for it over the radio, at the end of the
 * roll-call, and everyone along the trail lights the post nearest them, passed down the mountain one
 * to the next; from her porch she watches the line of light come down to her ahead of Pip. Her line
 * at the homecoming says how many Pip lit and how many the valley did (data/dialogueFills.ts
 * 'nana-posts'), because a run that lit four of twelve was told she watched Pip light them all.
 *
 * It waits until Pip can see it. Where Pip stands for the call, by Edda's hut, the summit's brow
 * hides the trail below, so a run that started on sign-off was over before anyone saw it. It starts
 * when Pip steps off the top (BROW from the mast), so the post ahead lights as Pip comes to it and
 * the next ones follow down the summit slope to the saddle. A player who lingers up top gets it
 * anyway, a little later (LATEST).
 *
 * Visual only. Nothing is written to `state.lanterns`, so no counter, toast, achievement or quest
 * sees it; a post lit this way simply offers no "Light" prompt (bootstrap.ts). Nor does it need a
 * save of its own: it follows from the radio quest being done, so a run loaded on the way down
 * starts with every post lit. Reduced motion lights them all at once.
 */

import type { GameState, Vec2 } from '../../core/contracts';
import { PICKUPS } from '../../data/pickups';
import { RADIO_QUEST } from '../../data/quests';
import { wayPoints } from '../world/trail';
import { HOLD } from '../camera/director';

/** Pip this far from the mast has stepped off the summit's top, and the trail below is in view. */
const BROW = 40;
/** Seconds after the camera turns home (HOLD) by which the run starts even if Pip has not moved. */
const LATEST = 10;
/** How fast the run of lights travels down the trail, units per second: a post every second or so. */
const SPEED = 60;

export interface WayHomeDeps {
  state: GameState;
  /** Where Pip is now. */
  pip(): Vec2;
  mast: Vec2;
  /** A conversation is open: the run waits for the radio to fall quiet. */
  talking(): boolean;
  /** `flare` while the run comes down the trail; quiet when a loaded save starts with them all lit. */
  light(id: string, flare: boolean): void;
}

export interface WayHome {
  /** This post was lit by the run, not by Pip. */
  lit(id: string): boolean;
  update(dt: number, reduced: boolean): void;
}

export function createWayHome(d: WayHomeDeps): WayHome {
  const { state } = d;
  const trail = wayPoints(2);
  /** How far up the trail a post stands, walked from the cabin. */
  const along = (x: number, z: number): number => {
    let best = trail[0];
    for (const p of trail) if (Math.hypot(p.x - x, p.z - z) < Math.hypot(best.x - x, best.z - z)) best = p;
    return best.s;
  };
  // Highest first: the run starts at the peak.
  const posts = PICKUPS.filter((p) => p.kind === 'lantern')
    .map((p) => ({ id: p.id, s: along(p.pos.x, p.pos.z) }))
    .sort((a, b) => b.s - a.s);
  const top = posts.length > 0 ? posts[0].s : 0;
  const lit = new Set<string>();
  const done = (): boolean => state.quests[RADIO_QUEST]?.status === 'complete';
  const light = (id: string, flare = true): void => {
    if (lit.has(id) || state.lanterns[id] !== undefined) return;
    lit.add(id);
    d.light(id, flare);
  };

  /** Seconds since the radio fell quiet, and when the run began on that clock; negative until then. */
  let clock = -1;
  let begun = -1;
  let finished = false;
  if (done()) {
    for (const p of posts) light(p.id, false);
    finished = true;
  }

  return {
    lit: (id) => lit.has(id),
    update(dt, reduced): void {
      if (finished) return;
      if (clock < 0) {
        if (!done() || d.talking()) return;
        clock = 0;
      }
      clock += dt;
      if (begun < 0) {
        const at = d.pip();
        const away = Math.hypot(at.x - d.mast.x, at.z - d.mast.z);
        if (clock < HOLD || (away < BROW && clock < HOLD + LATEST)) return;
        begun = clock;
      }
      const front = (clock - begun) * SPEED;
      for (const p of posts) if (reduced || top - p.s <= front) light(p.id);
      finished = posts.every((p) => lit.has(p.id) || state.lanterns[p.id] !== undefined);
    },
  };
}
