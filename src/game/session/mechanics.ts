/**
 * State-mutating mechanics: event flush, pickup collection, conversations, activity hosting.
 *
 * These are the operations that change GameState, extracted from the session so the frame loop
 * stays readable as an ordering of phases rather than a pile of mutations.
 */

import type {
  ActivityHost,
  ActivityInstance,
  EventBus,
  GameEvent,
  GameState,
  InputFrame,
  PlayerState,
  TerrainSampler,
} from '../../core/contracts';
import type { QuestEngine, StepPassed } from '../../core/progress/quests';
import type { AchievementEngine } from '../../core/progress/achievements';
import { applyEvent } from '../../core/progress/progress';
import { conversationFor, createDepartures } from '../../core/progress/conversation';
import { TUNING } from '../../core/player/tuning';
import { NPCS } from '../../data/npcs';
import { QUESTS } from '../../data/quests';
import { ITEMS } from '../../data/items';
import { PLACES } from '../../data/places';
import type { WorldBuild } from '../world/assemble';

export interface MechanicsDeps {
  state: GameState;
  player: PlayerState;
  bus: EventBus;
  quests: QuestEngine;
  achievements: AchievementEngine;
  world: WorldBuild;
  sampler: TerrainSampler;
  /** Current camera heading. Passing a constant here silently broke every aiming minigame. */
  cameraYaw(): number;
}

export interface Mechanics {
  /** Apply queued events to state and return every event applied since the last call, for feedback. */
  flush(): GameEvent[];
  /** Pick up `id`; a priced one (Gus's counter) is paid for out of the purse. */
  collect(id: string, kind: string, price?: number): void;
  /**
   * Count a conversation with `npcId`, advance every quest it touches, and return the node to open.
   * A main-story offer is accepted at once. An errand is only offered (`offer`): the conversation ends
   * on Pip's "i'll do it" / "not now", and `accept` takes it on. Idle talk used to start errands without
   * the player choosing. Null for an unknown NPC.
   */
  talk(npcId: string): { node: string; offer: string | null } | null;
  /** Take on an offered errand. False if it is no longer available. */
  accept(questId: string): boolean;
  hostFor(instance: ActivityInstance, input: InputFrame): ActivityHost;
  resetStaminaCap(): void;
}

export function createMechanics(deps: MechanicsDeps): Mechanics {
  const { state, player, bus, quests, achievements, world } = deps;

  /**
   * Events already applied to state but not yet handed to feedback. A conversation has to apply its
   * talk at once — the node it opens depends on what the talk completed — and the toasts it earns
   * must still reach the router on the frame's normal flush.
   */
  let applied: GameEvent[] = [];

  const resetStaminaCap = (): void => {
    player.maxStamina = TUNING.staminaMaxBase + state.feathers;
  };

  const itemName = (id: string): string => ITEMS.find((i) => i.id === id)?.name ?? id;

  /**
   * Events are applied to state BEFORE they are routed to feedback, so a toast can never announce
   * something the state did not record. Completion, start and unlock events produced by applyEvent
   * are re-emitted and applied on the next drain, which keeps the ordering explicit, not re-entrant.
   */
  const applyQueued = (): StepPassed[] => {
    const seen = bus.drain();
    const passed: StepPassed[] = [];
    for (const e of seen) {
      const outcome = applyEvent(state, e.name, e.data, quests, achievements);
      passed.push(...outcome.passedSteps);
      for (const p of outcome.passedSteps) {
        if (p.step.gives) {
          bus.emit('toast', { text: `Got: ${itemName(p.step.gives.item)}`, icon: 'quest', tier: 'discovery' });
        }
        // A step that sent Pip to stand somewhere says what Pip found there, but only on the arrival
        // itself: a place visited before the errand passes the step at the giver's, far from it.
        if (p.step.when.kind === 'reached' && e.name === 'place:reached') {
          const id = p.step.when.id;
          const heard = PLACES.find((pl) => pl.id === id)?.heard;
          if (heard && (e.data as { id: string }).id === id) {
            bus.emit('toast', { text: heard, icon: 'quest', tier: 'discovery' });
          }
        }
        // An errand moved on by something Pip did out in the valley, not by a talk, says so and says
        // what comes next. Critic round 5 missed seven pinecones of eight, saw the errand move on, and
        // could not tell whether the toss had counted: Tamsin only asked for a go at it.
        const def = QUESTS.find((q) => q.id === p.quest);
        const next = def?.steps[p.index + 1];
        if (def && def.main !== true && p.step.when.kind !== 'talked' && next) {
          bus.emit('toast', { text: `${def.title} — ${next.text}`, icon: 'quest', tier: 'milestone' });
        }
      }
      for (const id of outcome.completedQuests) {
        bus.emit('quest:completed', { id });
        // An errand that pays in a thing, not just bells, says what Pip now carries.
        const item = QUESTS.find((q) => q.id === id)?.reward.item;
        if (item) bus.emit('toast', { text: `Got: ${itemName(item)}`, icon: 'quest', tier: 'discovery' });
      }
      for (const id of outcome.startedQuests) bus.emit('quest:started', { id });
      for (const id of outcome.unlockedAchievements) bus.emit('achievement:unlocked', { id });
    }
    // Reward-granted feathers raise state.feathers without going through collect(), so the cap has
    // to be re-derived here or a quest reward would add capacity the player never receives.
    if (seen.length > 0) resetStaminaCap();
    applied.push(...seen);
    return passed;
  };

  // Whether Pip walked off between two talks with the same villager; flush runs once a frame.
  const departures = createDepartures();

  const flush = (): GameEvent[] => {
    departures.follow(player.pos);
    applyQueued();
    const out = applied;
    applied = [];
    return out;
  };

  const collect = (id: string, kind: string, price = 0): void => {
    state.flags[`picked:${id}`] = true;
    world.setCollected(id);
    if (price > 0) {
      state.bells = Math.max(0, state.bells - price);
      bus.emit('toast', { text: `Bought a feather from Gus for ${price} bells: longer breath for running and flapping`, icon: 'feather', tier: 'discovery' });
    }
    if (kind === 'feather') {
      const total = state.feathers + 1;
      // A feather is worth a flap's worth of capacity AND a little warmth right now, so the pickup
      // feels like a gift rather than a spreadsheet increment.
      player.maxStamina = TUNING.staminaMaxBase + total;
      player.stamina = Math.min(player.maxStamina, player.stamina + 1);
      bus.emit('feather:collected', { id, total });
    } else {
      bus.emit('bell:collected', { n: 1 });
    }
  };

  const accept = (id: string): boolean => {
    if (!quests.accept(id, state)) return false;
    bus.emit('quest:started', { id });
    // A quest that hands something over as it is taken on (QuestDef.gives) says so, as a step gift does.
    const gift = QUESTS.find((q) => q.id === id)?.gives;
    if (gift) bus.emit('toast', { text: `Got: ${itemName(gift.item)}`, icon: 'quest', tier: 'discovery' });
    return true;
  };

  const talk = (npcId: string): { node: string; offer: string | null } | null => {
    const npc = NPCS.find((n) => n.id === npcId);
    if (!npc) return null;
    bus.emit('npc:talked', { id: npcId });
    const passed = applyQueued();
    const stayed = departures.stayed(npcId);
    departures.talked(npcId, npc.pos);
    const chat = conversationFor(npc, passed, QUESTS, quests.status, (id) => state.quests[id]?.step ?? 0, stayed);
    if (chat.accept === null) return { node: chat.node, offer: null };
    const main = QUESTS.find((q) => q.id === chat.accept)?.main === true;
    if (main) {
      accept(chat.accept);
      return { node: chat.node, offer: null };
    }
    return { node: chat.node, offer: chat.accept };
  };

  const hostFor = (instance: ActivityInstance, input: InputFrame): ActivityHost => ({
    state,
    terrain: deps.sampler,
    playerPos: player.pos,
    input,
    cameraYaw: deps.cameraYaw(),
    emit: (name, data) => bus.emit(name, data),
    award: (result) => {
      bus.emit('activity:completed', { id: instance.def.id, score: result.score, bonus: result.bonus });
      // Best times, by course: the sleds, and since round 10 the races under `race:<id>` (the field keeps
      // its first name; the journal's sled stat skips those).
      if (instance.def.kind === 'sled' || instance.def.kind === 'race') {
        const key = instance.def.kind === 'race' ? `race:${instance.def.id}` : instance.def.id;
        const best = state.sledBests[key];
        if (best === undefined || result.score < best) state.sledBests[key] = result.score;
      }
    },
  });

  return { flush, collect, talk, accept, hostFor, resetStaminaCap };
}
