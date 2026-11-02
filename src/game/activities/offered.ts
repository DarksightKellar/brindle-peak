/**
 * Whether an activity post should offer itself right now.
 *
 * A finished build used to start again on the next press: the counter went to 2 and the first frame of
 * the new attempt cleared the pile, so Bram's woodpile vanished the moment the player pressed E beside
 * it. A finished build now stays finished — unless a quest step is waiting on that very build. Most
 * steps count a build done earlier (doneOnce, core/progress/quests.ts); a \`fresh\` step counts only a
 * run made while it is current, and for those the post offers itself again.
 */

import type { ActivityDef, GameState } from '../../core/contracts';
import { QUESTS } from '../../data/quests';

/** True when some active quest's current step is "do activity `id`". */
function questWants(id: string, state: Readonly<GameState>): boolean {
  return QUESTS.some((q) => {
    const p = state.quests[q.id];
    if (!p || p.status !== 'active') return false;
    const step = q.steps[p.step];
    return step !== undefined && step.when.kind === 'activity' && step.when.id === id;
  });
}

export function activityOffered(def: ActivityDef, state: Readonly<GameState>): boolean {
  if (def.kind !== 'build') return true;
  const done = (state.counters[`activity:${def.id}`] ?? 0) > 0;
  return !done || questWants(def.id, state);
}
