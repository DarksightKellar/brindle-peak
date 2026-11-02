/**
 * The goal line's words.
 *
 * Pulled out of `hud.ts` when the field guide added a second line beneath it: two sentences with
 * different jobs, and the rule between them is easier to keep when both are readable in one place.
 *
 * The goal is the main story's current step. The next line is the nearest errand, so the two can
 * never repeat each other (docs/GUIDE.md). Both come from quest steps; nothing here invents a task.
 */

import type { GameState } from '../../core/contracts';
import type { GuideStep } from '../../core/guide/nextStep';
import { FINALE_QUEST } from '../../data/quests';

/**
 * Keyed to progress, never to the zone the player stands in. It used to read the zone, so stepping
 * onto the peak said "you made it" and stepping back off said "climb to the mast" again — a loop with
 * no end, reported as "nothing is really happening".
 *
 * The lantern sentence rides along once the lantern is owned, the call has not gone out and the goal
 * lies in another zone: before the lantern it pointed at posts the player could not light.
 */
export function goalLine(s: GameState, main: GuideStep | null): string {
  if (main) {
    // Only on the way: standing in the step's own zone, "the way up" is behind you.
    const lanterns = s.abilities.lantern && s.quests[FINALE_QUEST]?.status !== 'complete' && s.zone !== main.zone;
    return lanterns ? `${main.stepText} The lantern posts mark the way up.` : main.stepText;
  }
  // No story step live: either it has not begun (Nana starts it) or every chapter is done.
  return s.talked.nana
    ? "The valley's talking again. Wander, or finish the field notes."
    : 'Talk to Nana at the cabin door.';
}
