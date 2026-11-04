/**
 * Nearest-interactable lookup. Pure data, no three, no DOM — it runs in tests unchanged.
 *
 * Cost: one linear pass over the registered set, no allocation, no sorting, so it holds
 * for the whole valley (n < 300) at 60 Hz (frame order step 4, ARCHITECTURE §3).
 *
 * Ties: two targets at the same horizontal distance are broken by `priority`, so an NPC
 * standing on a bell is talked to rather than picked up. NPCs also win when a pickup is
 * fractionally closer, which is what stops a bell pile from stealing a conversation.
 *
 * `wanted` marks what a quest is waiting on right now. In reach, it beats anything that is not, however
 * close: standing on Bram's heap with his woodpile errand open offered TALK, not STACK, because Bram
 * stood nearer than the heap's post.
 *
 * `usable` hides what E cannot act on right now — a lantern post before the lantern is owned, or one
 * already lit — so the prompt never offers a press that does nothing.
 */

import type { Interactable, InteractableKind, Vec3 } from '../core/contracts';

export interface InteractionSystem {
  register(i: Interactable): void;
  update(playerPos: Vec3): Interactable | null;
}

/** Higher wins a tie. Pickups are noise; a person is intent. */
const priority = (kind: InteractableKind): number => {
  if (kind === 'npc') return 3;
  if (kind === 'pickup') return 1;
  return 2;
};

/** Squared distances within this of each other count as the same reach. */
const TIE = 1e-4;
/**
 * A person this much nearer than the current pick (metres) still counts as level with it. Critic round 12
 * walked up to Gus past an activity's ring, pressed E, and got the activity: the ring was a step closer.
 */
const NPC_EDGE = 1.5;

/**
 * Extra reach (metres) for what a quest is waiting on. Critic round 13 stood by the loose logs and the
 * woodpile's ring, 6 m from its post, and got TALK for Bram, who stood nearer, instead of STACK.
 */
const WANTED_REACH = 2;

/** Distance as `priority` sees it: a person reads as standing a little nearer than they are. */
const reach = (it: Interactable, d2: number): number => {
  if (it.kind !== 'npc') return d2;
  const d = Math.max(0, Math.sqrt(d2) - NPC_EDGE);
  return d * d;
};

export function createInteractionSystem(
  usable: (i: Interactable) => boolean = () => true,
  wanted: (i: Interactable) => boolean = () => false,
): InteractionSystem {
  const items: Interactable[] = [];

  return {
    register(i: Interactable): void {
      if (items.indexOf(i) === -1) items.push(i);
    },

    update(playerPos: Vec3): Interactable | null {
      let best: Interactable | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      let bestWanted = false;

      for (let k = 0; k < items.length; k++) {
        const it = items[k];
        const dx = it.pos.x - playerPos.x;
        const dz = it.pos.z - playerPos.z;
        const raw = dx * dx + dz * dz;
        const w = wanted(it);
        const r = it.radius + (w ? WANTED_REACH : 0);
        if (raw > r * r || !usable(it)) continue;
        const d2 = reach(it, raw);
        if (bestWanted && !w) continue;
        if (best === null || (w && !bestWanted) || d2 < bestD - TIE) {
          best = it;
          bestD = d2;
          bestWanted = w;
        } else if (d2 - bestD <= TIE && priority(it.kind) > priority(best.kind)) {
          best = it;
          bestD = d2;
        }
      }
      return best;
    },
  };
}
