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
import type { DialogueFlow, PendingOffer } from './dialogueFlow';
import type { Mechanics } from './mechanics';
import { NPCS } from '../../data/npcs';
import { PICKUPS } from '../../data/pickups';
import { PIP_ASK_ANY, PIP_ASK_REST, PIP_ASKS } from '../../data/pipAsks';
import { SPECIES_SIZE } from '../world/npcSpecies';
import { allSatisfied, evaluate } from '../../core/progress/conditions';
import { KEY } from '../../core/keys';

/** What the counter says when Pip cannot pay. */
const WORDS_SHOP = {
  short: (price: number, have: number): string =>
    `One of Gus's feathers: ${price} bells. You have ${have}. Bells come from errands, games and the snow`,
  ask: (price: number, have: number): string =>
    `One of Gus's feathers is ${price} bells, and you have ${have}. Press ${KEY.interact} again to buy it`,
};

/**
 * After a purchase the counter rests this long (ms) before it sells again. The two feathers sit 3 u
 * apart, so a second press bought the second one: critic round 32 pressed E twice and paid 80 bells.
 */
const BUY_REST_MS = 3000;
const boughtAt = new WeakMap<GameState, number>();
/**
 * A first press at the counter asks; a second within this long (ms) buys. Gus stands beside his stand, and
 * critic round 131 pressed F to talk to him and paid 40 bells for a feather it hadn't meant to buy.
 */
const BUY_ASK_MS = 5000;
const askedAt = new WeakMap<GameState, { id: string; at: number }>();

/**
 * The villager Pip last said "not now" to, and where Pip stood. Until Pip has walked this far from there,
 * talking to them again gets a word, not the offer (dialogueFlow.ts `remind`).
 */
const WALKED_OFF = 12;
const declinedAt = new WeakMap<GameState, { npc: string; x: number; z: number }>();

/**
 * Forget the "not now" once Pip has walked off, checked every frame. Checked only at the next talk, the
 * distance was measured back beside Bram: critic round 72 walked away and back and heard "It'll keep"
 * for good.
 */
export function noteWalkOff(state: GameState, pos: { x: number; z: number }): void {
  const turned = declinedAt.get(state);
  if (turned && Math.hypot(pos.x - turned.x, pos.z - turned.z) >= WALKED_OFF) declinedAt.delete(state);
}

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
  /** Sit Pip on a bench (data/seats.ts); the session keeps Pip perched until a move. */
  sit?(seatId: string): void;
}

/** The errand put to Pip in this talk, and what Pip's answer does. */
function offerFor(d: InteractVerbDeps, id: string, npc: string): PendingOffer | undefined {
  const offered = QUESTS.find((q) => q.id === id);
  if (!offered) return undefined;
  const state = d.state;
  return {
    title: offered.title,
    story: offered.main === true,
    // An activity Pip has already done for the first part is not offered again in Pip's own words.
    ask: offered.steps[0]?.when.kind === 'activity' && evaluate(offered.steps[0].when, state) ? PIP_ASK_REST : PIP_ASKS[id] ?? PIP_ASK_ANY,
    // Taken on, the "not now" is over: critic round 131 said yes to Sable after a no, came back with the
    // readings, and heard "It'll keep" three times over the goal's "Give Sable your readings — here".
    accept: () => {
      declinedAt.delete(state);
      d.mech.accept(id);
    },
    // A "not now" is kept in the save: critic round 34 declined Bram's rope and had nothing to find it by.
    decline: () => {
      state.flags[`declined:${id}`] = true;
      declinedAt.set(state, { npc, x: d.player.pos.x, z: d.player.pos.z });
    },
  };
}

/** Returns nothing; every effect goes through the bus or the systems it was given. */
export function interact(d: InteractVerbDeps): void {
  if (d.flow.isOpen()) return;
  const target = d.interactions.update(d.player.pos);
  if (!target) {
    // Down on the ice, F goes round again from here (activityRunner.ts `again`); the lap carries Pip.
    const again = d.runner.again();
    if (again) d.runner.start(again);
    return;
  }

  if (target.kind === 'npc') {
    noteWalkOff(d.state, d.player.pos);
    const turned = declinedAt.get(d.state);
    // A word first, then Pip's answer again: critic round 77 read "talk to Bram again to take it on",
    // asked straight away, and heard only "It'll keep" however often it asked.
    const kept = turned && turned.npc === target.id
      ? QUESTS.find((q) => q.giver === target.id && d.state.flags[`declined:${q.id}`] === true
        && d.state.quests[q.id] === undefined && allSatisfied(q.requires, d.state))
      : undefined;
    if (kept) {
      standClear(d.player, target.id);
      d.flow.remind(target.id, offerFor(d, kept.id, target.id));
      return;
    }
    // Nothing left turned down with them: the talk goes on as any other.
    if (turned && turned.npc === target.id) declinedAt.delete(d.state);
    // The talk is counted first and the node chosen from what it changed (core/progress/conversation),
    // so a report-back conversation speaks the payoff instead of replaying the request.
    const talk = d.mech.talk(target.id);
    if (talk === null) return;
    standClear(d.player, target.id);
    d.flow.open(target.id, talk.node, talk.offer === null ? undefined : offerFor(d, talk.offer, target.id));
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

  // Something for sale (Gus's feathers): bought on the press, or told what it costs and where bells come from.
  if (target.kind === 'pickup') {
    const p = PICKUPS.find((x) => x.id === target.id);
    if (!p || p.price === undefined || d.state.flags[`picked:${p.id}`]) return;
    const now = performance.now();
    if (now - (boughtAt.get(d.state) ?? -Infinity) < BUY_REST_MS) return;
    if (d.state.bells >= p.price) {
      const asked = askedAt.get(d.state);
      if (!asked || asked.id !== p.id || now - asked.at > BUY_ASK_MS) {
        askedAt.set(d.state, { id: p.id, at: now });
        d.bus.emit('toast', { text: WORDS_SHOP.ask(p.price, d.state.bells), icon: 'feather', tier: 'discovery' });
        return;
      }
      askedAt.delete(d.state);
      d.mech.collect(p.id, p.kind, p.price);
      boughtAt.set(d.state, now);
    } else d.bus.emit('toast', { text: WORDS_SHOP.short(p.price, d.state.bells), icon: 'feather', tier: 'discovery' });
    return;
  }

  if (target.kind === 'seat') {
    d.sit?.(target.id);
    return;
  }

  if (target.kind === 'lantern' && !d.state.lanterns[target.id] && d.state.abilities.lantern) {
    d.state.lanterns[target.id] = 1;
    d.world.setLanternLit(target.id, true);
    d.bus.emit('lantern:lit', { id: target.id, lit: Object.keys(d.state.lanterns).length });
  }
}
