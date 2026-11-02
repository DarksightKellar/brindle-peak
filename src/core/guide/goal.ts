/**
 * Where "the goal" is, as a point on the ground — the one rule the compass, the world marker and the
 * camera's after-conversation turn all share.
 *
 * The goal line names the main story's step, so the point is that step's target. Before the story has
 * begun the goal line says to talk to whoever gives the first main quest, so the point is them. Once
 * the story is done, or its step names nothing placed, there is no story point and the HUD may fall back
 * to the errand line's step (hud.ts); that fallback is HUD-only because it depends on what the errand
 * line chose to show.
 *
 * Pure: reads `GameState` and the content it is handed.
 */

import type { GameState, Vec2 } from '../contracts';
import type { GuideContent } from './nextStep';
import { nextStepFor } from './nextStep';

/** The giver of the first main quest: the person the run opens by sending you to. */
export function openerOf(content: GuideContent): string | null {
  return content.quests.find((q) => q.main === true)?.giver ?? null;
}

/** The story's point on the ground for this state, seen from `from`; null when it names none. */
export function goalTarget(s: GameState, from: Vec2, content: GuideContent): Vec2 | null {
  const main = nextStepFor(s, from, content, 'main');
  if (main) return main.target;
  const opener = openerOf(content);
  if (opener === null || s.talked[opener] === true) return null;
  const npc = content.npcs.find((n) => n.id === opener);
  return npc ? { x: npc.pos.x, z: npc.pos.z } : null;
}
