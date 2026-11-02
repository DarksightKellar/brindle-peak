/** Builders shared by the progress, events and save suites. Not a test file: vitest only runs *.test.ts. */
import type { AchievementDef, Condition, GameState, QuestDef } from '../src/core/contracts';
import { createGameState } from '../src/core/contracts';

export const fresh = (): GameState => createGameState({ x: 0, y: 1.5, z: 0 }, 6);

export const step = (when: Condition, id = 's1') => ({ id, text: id, when });

export const questDef = (over: Partial<QuestDef> & { id: string }): QuestDef => ({
  title: 'T', giver: 'hollis', zone: 'hearth', offer: 'o', waiting: 'w',
  steps: [step({ kind: 'talked', id: 'hollis' })], reward: {}, blurb: 'b', ...over,
});

export const achDef = (id: string, trigger: Condition): AchievementDef => ({
  id, name: id, desc: id, icon: 'M0 0L12 12', trigger,
});

/** One real conversation: the flag and the running count, as `npc:talked` writes them. */
export const talk = (s: GameState, id: string): void => {
  s.talked[id] = true;
  s.talkedAt[id] = (s.talkedAt[id] ?? 0) + 1;
};
