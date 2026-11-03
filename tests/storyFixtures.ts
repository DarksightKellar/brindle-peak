/**
 * The shipped story, driven through the same conversation path the game uses (mechanics.talk), for the
 * story and errand suites. Not a test file: vitest only runs *.test.ts.
 */

import type { PlayerState, TerrainSampler, ZoneId } from '../src/core/contracts';
import { createGameState } from '../src/core/contracts';
import { createEventBus } from '../src/core/progress/events';
import { createQuestEngine } from '../src/core/progress/quests';
import { createAchievementEngine } from '../src/core/progress/achievements';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { QUESTS } from '../src/data/quests';
import { createMechanics } from '../src/game/session/mechanics';
import { NPCS } from '../src/data/npcs';
import type { WorldBuild } from '../src/game/world/assemble';

export function play() {
  const state = createGameState({ x: 0, y: 0, z: 0 }, 6);
  const bus = createEventBus();
  const quests = createQuestEngine(QUESTS);
  const player = { pos: { x: 0, y: 0, z: 0 }, stamina: 6, maxStamina: 6 } as unknown as PlayerState;
  const mech = createMechanics({
    state,
    player,
    bus,
    quests,
    achievements: createAchievementEngine(ACHIEVEMENTS),
    world: { setCollected: () => undefined } as unknown as WorldBuild,
    sampler: {} as TerrainSampler,
    cameraYaw: () => 0,
  });
  /** Pip stands beside `npc` (the talks in this file happen wherever Pip is unless placed). */
  const beside = (npc: string): void => {
    const at = NPCS.find((n) => n.id === npc)?.pos ?? { x: 0, z: 0 };
    player.pos.x = at.x + 2;
    player.pos.z = at.z;
    mech.flush();
  };
  const emit = (name: 'activity:completed' | 'zone:entered', id: string): void => {
    if (name === 'activity:completed') bus.emit(name, { id, score: 1 });
    else bus.emit(name, { id: id as ZoneId });
    mech.flush();
  };
  // Talks as a player who says "i'll do it" to every errand offered: the node opened, as the game opens it.
  const talk = (id: string): string | null => {
    const r = mech.talk(id);
    if (r?.offer) mech.accept(r.offer);
    return r?.node ?? null;
  };
  return { state, quests, mech, emit, beside, talk };
}
