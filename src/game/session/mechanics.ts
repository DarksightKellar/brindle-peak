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
  collect(id: string, kind: string): void;
  /**
   * Count a conversation with `npcId`, advance every quest it touches, and return the node to open.
   * Accepts the quest being offered, if the node is an offer. Null for an unknown NPC.
   */
  talk(npcId: string): string | null;
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
      }
      for (const id of outcome.completedQuests) bus.emit('quest:completed', { id });
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

  const collect = (id: string, kind: string): void => {
    state.flags[`picked:${id}`] = true;
    world.setCollected(id);
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

  const talk = (npcId: string): string | null => {
    const npc = NPCS.find((n) => n.id === npcId);
    if (!npc) return null;
    bus.emit('npc:talked', { id: npcId });
    const passed = applyQueued();
    const stayed = departures.stayed(npcId);
    departures.talked(npcId, npc.pos);
    const chat = conversationFor(npc, passed, QUESTS, quests.status, (id) => state.quests[id]?.step ?? 0, stayed);
    if (chat.accept !== null && quests.accept(chat.accept, state)) {
      bus.emit('quest:started', { id: chat.accept });
      // A quest that hands something over as it is taken on (QuestDef.gives) says so, as a step gift does.
      const gift = QUESTS.find((q) => q.id === chat.accept)?.gives;
      if (gift) bus.emit('toast', { text: `Got: ${itemName(gift.item)}`, icon: 'quest', tier: 'discovery' });
    }
    return chat.node;
  };

  const hostFor = (instance: ActivityInstance, input: InputFrame): ActivityHost => ({
    state,
    terrain: deps.sampler,
    playerPos: player.pos,
    input,
    cameraYaw: deps.cameraYaw(),
    emit: (name, data) => bus.emit(name, data),
    award: (result) => {
      bus.emit('activity:completed', { id: instance.def.id, score: result.score });
      if (instance.def.kind === 'sled') {
        const best = state.sledBests[instance.def.id];
        if (best === undefined || result.score < best) state.sledBests[instance.def.id] = result.score;
      }
    },
  });

  return { flush, collect, talk, hostFor, resetStaminaCap };
}
