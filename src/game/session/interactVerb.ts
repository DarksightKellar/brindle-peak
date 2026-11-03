/**
 * The interact key, dispatched by what is in reach.
 *
 * Split out of the session because this one function is where four different systems meet (dialogue,
 * quests, activities, lanterns). The policy it keeps is small on purpose: a conversation is counted
 * before its node is chosen (`mech.talk`), and a lantern is lit only by someone carrying the lantern.
 */

import type { EventBus, GameState, PlayerState } from '../../core/contracts';
import { ACTIVITIES } from '../../data/activities';
import { QUESTS } from '../../data/quests';
import type { InteractionSystem } from '../interactions';
import type { WorldBuild } from '../world/assemble';
import type { ActivityRunner } from './activityRunner';
import type { DialogueFlow } from './dialogueFlow';
import type { Mechanics } from './mechanics';

export interface InteractVerbDeps {
  state: GameState;
  player: PlayerState;
  bus: EventBus;
  mech: Mechanics;
  world: WorldBuild;
  interactions: InteractionSystem;
  flow: DialogueFlow;
  runner: ActivityRunner;
}

/** Returns nothing; every effect goes through the bus or the systems it was given. */
export function interact(d: InteractVerbDeps): void {
  if (d.flow.isOpen()) return;
  const target = d.interactions.update(d.player.pos);
  if (!target) return;

  if (target.kind === 'npc') {
    // The talk is counted first and the node chosen from what it changed (core/progress/conversation),
    // so a report-back conversation speaks the payoff instead of replaying the request.
    const talk = d.mech.talk(target.id);
    if (talk === null) return;
    const offered = talk.offer === null ? undefined : QUESTS.find((q) => q.id === talk.offer);
    const id = talk.offer;
    d.flow.open(target.id, talk.node, offered && id !== null ? { title: offered.title, accept: () => d.mech.accept(id) } : undefined);
    return;
  }

  if (target.kind === 'activity') {
    const def = ACTIVITIES.find((a) => a.id === target.id);
    if (def) d.runner.start(def);
    return;
  }

  if (target.kind === 'lantern' && !d.state.lanterns[target.id] && d.state.abilities.lantern) {
    d.state.lanterns[target.id] = 1;
    d.world.setLanternLit(target.id);
    d.bus.emit('lantern:lit', { id: target.id, lit: Object.keys(d.state.lanterns).length });
  }
}
