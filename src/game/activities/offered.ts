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
import { QUESTS, RADIO_QUEST } from '../../data/quests';

/**
 * Activities that wait for a quest to be given. The aurora is only in the sky once Edda has asked for it
 * (render/dusk.ts): critic round 18 photographed a pale daytime sky first, and Edda then asked for a
 * picture they had already taken.
 */
const WAITS_FOR: Readonly<Record<string, string>> = { 'peak-aurora-photo': RADIO_QUEST };

/** True when some active quest's current step is "do activity `id`". */
export function questWants(id: string, state: Readonly<GameState>): boolean {
  return QUESTS.some((q) => {
    const p = state.quests[q.id];
    if (!p || p.status !== 'active') return false;
    const step = q.steps[p.step];
    return step !== undefined && step.when.kind === 'activity' && step.when.id === id;
  });
}

export function activityOffered(def: ActivityDef, state: Readonly<GameState>): boolean {
  const quest = WAITS_FOR[def.id];
  const given = state.quests[quest ?? '']?.status;
  if (quest !== undefined && given !== 'active' && given !== 'complete') return false;
  if (def.kind !== 'build') return true;
  const done = (state.counters[`activity:${def.id}`] ?? 0) > 0;
  return !done || questWants(def.id, state);
}
