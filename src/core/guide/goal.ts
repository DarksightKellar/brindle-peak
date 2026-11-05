/**
 * Where "the goal" is, as a point on the ground — the one rule the compass, the world marker and the
 * camera's after-conversation turn all share.
 *
 * The goal line names the main story's step, so the point is that step's target. Before the story has
 * begun the goal line says to talk to whoever gives the first main quest, so the point is them. Once
 * the story is done, the point is the nearest villager Pip has never spoken to (`unmetAfterStory`):
 * critic round 26 came home to "Wander" with nothing pointing at the hamlet and five names Edda had
 * mentioned. With everyone met, or a story step that names nothing placed, there is no story point and
 * the HUD may fall back to the errand line's step (hud.ts); that fallback is HUD-only because it depends
 * on what the errand line chose to show.
 *
 * Pure: reads `GameState` and the content it is handed.
 */

import type { GameState, Vec2 } from '../contracts';
import type { GuideContent, GuideNpc } from './nextStep';
import { nextStepFor } from './nextStep';

/** The giver of the first main quest: the person the run opens by sending you to. */
export function openerOf(content: GuideContent): string | null {
  return content.quests.find((q) => q.main === true)?.giver ?? null;
}

/** The story's point on the ground for this state, seen from `from`; null when it names none. */
export function goalTarget(s: GameState, from: Vec2, content: GuideContent): Vec2 | null {
  const main = nextStepFor(s, from, content, 'main');
  if (main) return main.target;
  const unmet = unmetAfterStory(s, from, content);
  if (unmet) return { x: unmet.pos.x, z: unmet.pos.z };
  const opener = openerOf(content);
  if (opener === null || s.talked[opener] === true) return null;
  const npc = content.npcs.find((n) => n.id === opener);
  return npc ? { x: npc.pos.x, z: npc.pos.z } : null;
}

/** After the story, the nearest villager Pip has never spoken to; null while it runs or once all are met. */
export function unmetAfterStory(s: GameState, from: Vec2, content: GuideContent): GuideNpc | null {
  const mains = content.quests.filter((q) => q.main === true);
  if (mains.length === 0 || !mains.every((q) => s.quests[q.id]?.status === 'complete')) return null;
  let best: GuideNpc | null = null;
  let near = Number.POSITIVE_INFINITY;
  for (const n of content.npcs) {
    if (s.talked[n.id] === true) continue;
    const d = Math.hypot(n.pos.x - from.x, n.pos.z - from.z);
    if (d < near) {
      near = d;
      best = n;
    }
  }
  return best;
}
