/**
 * A fake ActivityHost for driving activities frame by frame: flat ground, a mutable input frame
 * and an award log. Shared by the race / build and throw play tests.
 */

import { createGameState, emptyInput } from '../src/core/contracts';
import type { ActivityDef, ActivityInstance, ActivityResult, InputFrame, TerrainSampler, Vec3 } from '../src/core/contracts';

export const FLAT: TerrainSampler = {
  size: 1024,
  heightAt: () => 0,
  normalAt: () => ({ x: 0, y: 1, z: 0 }),
  sampleAt: () => ({ height: 0, slope: 0, surface: 'snow', zone: 'hearth' }),
};

export interface Host {
  state: ReturnType<typeof createGameState>;
  terrain: TerrainSampler;
  playerPos: Vec3;
  input: InputFrame;
  cameraYaw: number;
  awards: ActivityResult[];
  emit(): void;
  award(r: ActivityResult): void;
}

export function host(playerPos: Vec3 = { x: 0, y: 0, z: 0 }, cameraYaw = 0): Host {
  const awards: ActivityResult[] = [];
  return {
    state: createGameState({ x: 0, y: 0, z: 0 }, 8),
    terrain: FLAT,
    playerPos,
    input: emptyInput(cameraYaw),
    cameraYaw,
    awards,
    emit: () => undefined,
    award: (r) => awards.push(r),
  };
}

export const FRAME = 1 / 60;
export function step(a: ActivityInstance, h: Host, over: Partial<InputFrame> = {}): void {
  h.input = { ...emptyInput(h.cameraYaw), ...over };
  a.update(FRAME, h);
}

export const def = (kind: ActivityDef['kind'], id: string, pos = { x: 0, z: 0 }): ActivityDef =>
  ({ id, name: id, kind, zone: 'hearth', pos, radius: 3, prompt: 'Go' });
