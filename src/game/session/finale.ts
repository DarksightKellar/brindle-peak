/**
 * When the ending card shows, and that it shows exactly once.
 *
 * The card belongs to the homecoming. It used to show on the summit after the radio call, which left
 * the walk home and the porch chat as an afterword nobody was told to expect. Now the story ends when
 * the conversation with Nana that completes `ENDING_QUEST` closes: worldRules.ts sets `flags.ending`
 * as that talk is counted (it opens the conversation), and the director holds the card until no
 * conversation is open, then a quiet second more, so the last line is not cut off by it (camera/director.ts).
 *
 * `flags.endingShown` is set only when the card actually appears. A run saved between the talk and the
 * card, closing the page mid-conversation, gets its card on load; a run that already saw it, including
 * an older save that saw it on the summit, never sees a second.
 */

import type { GameState } from '../../core/contracts';
import { PICKUPS } from '../../data/pickups';
import { QUESTS } from '../../data/quests';
import { ZONES } from '../../data/zones';
import { endingStats, type Ending } from '../ui/ending';

export function createFinale(
  state: GameState,
  ending: Ending,
  director: { finale(show: () => void): void },
): () => void {
  const show = (): void => {
    if (state.flags.endingShown) return;
    state.flags.endingShown = true;
    ending.show(endingStats(state, {
      feathers: PICKUPS.filter((p) => p.kind === 'feather').length,
      quests: QUESTS.length,
      zones: ZONES.length,
    }));
  };
  if (state.flags.ending && !state.flags.endingShown) director.finale(show);
  return () => director.finale(show);
}
