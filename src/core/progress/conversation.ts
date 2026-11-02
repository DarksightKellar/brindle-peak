/**
 * Which node an NPC speaks, decided AFTER the conversation has been counted.
 *
 * The old rule picked a node from the quest status before the talk was applied and encoded quest
 * state in node-id suffixes (`-wait`, `-done`, `-bwait`…). So the talk that finished a quest replayed
 * the request, the following talk jumped a chapter ahead, and a giver could never own more than two
 * quests. Now every node is named by the data that owns it — `QuestDef.offer`, `QuestDef.waiting`,
 * `QuestStep.say`, `QuestStep.hold`, `NpcDef.idle` — and the choice is one ordered list:
 *
 *   1. This talk passed a step aimed at this NPC      -> that step's `say` (main story first), and the
 *                                                         quest the step `offers`, if any, is accepted.
 *   2. A running quest already passed a talk with them -> that step's `hold`, if it has one.
 *   3. One of this NPC's quests is still running        -> its `waiting` node, or its `still` node
 *                                                         when Pip has not walked away since they last
 *                                                         spoke (`waiting` greets a return).
 *   4. This NPC has a quest available                   -> its `offer` node, and talking accepts it.
 *   5. This NPC's quest is not unlocked yet              -> its `notYet` node, if it has one.
 *   6. Otherwise                                        -> the NPC's `idle` node.
 *
 * Pure: no session, no DOM, so the whole order is testable with a state object and the content tables.
 */

import type { NpcDef, QuestDef, QuestStatus, Vec2 } from '../contracts';
import type { StepPassed } from './quests';

/** Farther than this from someone Pip spoke to, and Pip has left them: the next talk is a return. */
export const LEAVE_RADIUS = 12;

export interface Departures {
  /** Pip has just spoken to `npcId`, who stands at `at`. */
  talked(npcId: string, at: Vec2): void;
  /** Once a frame, with where Pip is. */
  follow(pos: Vec2): void;
  /** Has Pip stayed near `npcId` since last speaking to them? False for anyone not spoken to yet. */
  stayed(npcId: string): boolean;
}

/**
 * Who Pip has not walked away from. Not saved: a run loaded from a save has been away from everyone,
 * which is the honest default for "You're back.".
 */
export function createDepartures(): Departures {
  const near = new Map<string, Vec2>();
  return {
    talked: (npcId, at) => void near.set(npcId, { x: at.x, z: at.z }),
    follow(pos): void {
      for (const [id, at] of near) {
        if (Math.hypot(pos.x - at.x, pos.z - at.z) > LEAVE_RADIUS) near.delete(id);
      }
    },
    stayed: (npcId) => near.has(npcId),
  };
}

export interface Conversation {
  node: string;
  /** Quest to accept as this conversation opens, if it is an offer. */
  accept: string | null;
}

export function conversationFor(
  npc: NpcDef,
  passed: readonly StepPassed[],
  quests: readonly QuestDef[],
  status: (id: string) => QuestStatus,
  /** The index of a running quest's current step. */
  stepOf: (id: string) => number,
  /** Pip has not walked away since last speaking to this NPC (Departures.stayed). */
  stayed = false,
): Conversation {
  const isMain = (id: string): boolean => quests.find((q) => q.id === id)?.main === true;
  const aimed = (when: { kind: string; id: string }): boolean => when.kind === 'talked' && when.id === npc.id;
  const spoken = passed
    .filter((p) => aimed(p.step.when) && p.step.say !== undefined)
    .sort((a, b) => Number(isMain(b.quest)) - Number(isMain(a.quest)));
  if (spoken.length > 0) {
    // One talk can pass two steps with this person when what lay between was already done (a pile
    // stacked before Bram asked): the later step's line is the one that is true now.
    const lead = spoken[0].quest;
    const said = spoken.filter((p) => p.quest === lead).pop()?.step ?? spoken[0].step;
    const offered = said.offers !== undefined && status(said.offers) === 'available' ? said.offers : null;
    return { node: said.say as string, accept: offered };
  }

  const running = [...quests.filter((q) => q.main), ...quests.filter((q) => !q.main)]
    .filter((q) => status(q.id) === 'active');
  for (const q of running) {
    // The latest talk with this NPC the quest has already passed, if it left a reminder behind.
    const behind = q.steps.slice(0, stepOf(q.id)).filter((s) => aimed(s.when)).pop();
    if (behind?.hold !== undefined) return { node: behind.hold, accept: null };
  }

  const own = quests.filter((q) => q.giver === npc.id);
  const mine = own.find((q) => status(q.id) === 'active');
  if (mine) return { node: stayed && mine.still !== undefined ? mine.still : mine.waiting, accept: null };

  // In declaration order, so a giver's second errand waits for the first to be finished.
  const offer = own.find((q) => status(q.id) === 'available');
  if (offer) return { node: offer.offer, accept: offer.id };

  const early = own.find((q) => status(q.id) === 'locked' && q.notYet !== undefined);
  if (early) return { node: early.notYet as string, accept: null };

  return { node: npc.idle, accept: null };
}
