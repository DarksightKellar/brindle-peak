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
import { NPCS } from '../../data/npcs';
import { SPECIES_SIZE } from '../world/npcSpecies';

/** Pip's own half-width, and the gap kept between the two bodies while they talk. */
const PIP_BULK = 0.45;
const TALK_GAP = 0.7;

/**
 * Step Pip back out of the villager before the talk is framed: walking up close put Tamsin and Edda
 * inside Pip for the whole conversation (critic round 24). Only ever backward, along the line from
 * the villager to Pip, so the two still face each other.
 */
function standClear(player: PlayerState, npcId: string): void {
  const npc = NPCS.find((n) => n.id === npcId);
  if (!npc) return;
  const need = 0.6 * (SPECIES_SIZE[npc.species] ?? 1) + PIP_BULK + TALK_GAP;
  const dx = player.pos.x - npc.pos.x, dz = player.pos.z - npc.pos.z;
  const far = Math.hypot(dx, dz);
  if (far >= need) return;
  const ux = far > 1e-3 ? dx / far : 0, uz = far > 1e-3 ? dz / far : 1;
  player.pos.x = npc.pos.x + ux * need;
  player.pos.z = npc.pos.z + uz * need;
}

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
    standClear(d.player, target.id);
    const offered = talk.offer === null ? undefined : QUESTS.find((q) => q.id === talk.offer);
    const id = talk.offer;
    d.flow.open(target.id, talk.node, offered && id !== null ? { title: offered.title, accept: () => d.mech.accept(id) } : undefined);
    return;
  }

  if (target.kind === 'activity') {
    const def = ACTIVITIES.find((a) => a.id === target.id);
    if (!def) return;
    if (target.standAt) {
      const p = d.player;
      p.pos.x = target.standAt.x;
      p.pos.y = target.standAt.y;
      p.pos.z = target.standAt.z;
      p.vel.x = p.vel.y = p.vel.z = 0;
    }
    d.runner.start(def);
    return;
  }

  if (target.kind === 'lantern' && !d.state.lanterns[target.id] && d.state.abilities.lantern) {
    d.state.lanterns[target.id] = 1;
    d.world.setLanternLit(target.id);
    d.bus.emit('lantern:lit', { id: target.id, lit: Object.keys(d.state.lanterns).length });
  }
}
