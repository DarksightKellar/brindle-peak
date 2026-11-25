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
export function goalLine(
  s: GameState,
  main: GuideStep | null,
  unmet: { name: string; zone: string } | null = null,
  following = false,
): string {
  if (main) {
    // Only on the way: standing in the step's own zone, "the way up" is behind you.
    const lanterns = s.abilities.lantern && s.quests[FINALE_QUEST]?.status !== 'complete' && s.zone !== main.zone;
    return lanterns ? `${main.stepText} The lantern posts mark the way up.` : main.stepText;
  }
  // No story step live: either it has not begun (Nana starts it) or every chapter is done. Done, it sends
  // Pip to someone not yet met (core/guide/goal.ts), the way Edda's "go and say hello" does.
  // With an errand under way it says that first, and the compass follows the errand (hud.ts): critic
  // round 40 took on Hollis's mitten and read "Go and say hello to Tamsin" over it, two orders at once.
  if (unmet) {
    const errand = Object.values(s.quests).some((q) => q.status === 'active');
    // Short: the end card has said the valley is talking, and this line sits over two more (critic round
    // 70 read three lines crowding the compass, the top one two clauses long).
    // So does a thing to try that Pip chose to follow from the journal: critic round 127 followed the Market
    // Lamps with no errand under way, and the goal line and the compass stayed on Gus.
    return errand
      ? `After your errands, say hello to ${unmet.name}, in ${unmet.zone}.`
      : following
        ? `Once you've had a go, say hello to ${unmet.name}, in ${unmet.zone}.`
        : `Go and say hello to ${unmet.name}, in ${unmet.zone}.`;
  }
  return s.talked.nana
    // It names the errands, so the line under it (an errand still open) reads as the same advice. Critic
    // round 22 read "finish the field notes" over "Ask Skiff about the flour" and took them to disagree.
    ? "The valley's talking again. Wander, or see your errands through."
    : 'Talk to Nana at the cabin door.';
}
