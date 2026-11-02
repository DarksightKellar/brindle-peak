/** The fake world and builders shared by the player suites. Not a test file: vitest only runs *.test.ts. */
import { createPlayerState, emptyInput } from '../src/core/contracts';
import type {
  InputFrame,
  PlayerAbilities,
  PlayerEnvironment,
  PlayerState,
  Rng,
  TerrainSampler,
  Vec3,
} from '../src/core/contracts';
import { TUNING } from '../src/core/player/tuning';

/**
 * Fake world, x-only so every slope is exactly computable. x < 8 is flat snow (spring patch
 * around x = 2):
 *   8 <= x < 12 sled ramp, gradient 1.1  -> slope 0.327
 *   12 <= x < 16 climb face, gradient 2  -> slope 0.553
 *   16 <= x < 22 ledge top
 *   x >= 22     sheer drop to 0 (the coyote/ledge case)
 */
export const heightOf = (x: number): number => {
  if (x < 8) return 0;
  if (x < 12) return (x - 8) * 1.1;
  if (x < 16) return 4.4 + (x - 12) * 2;
  if (x < 22) return 12.4;
  return 0;
};

const normalOf = (x: number): Vec3 => {
  const e = 0.05;
  const gx = (heightOf(x + e) - heightOf(x - e)) / (2 * e);
  const len = Math.hypot(gx, 1);
  return { x: -gx / len, y: 1 / len, z: 0 };
};

export const terrain: TerrainSampler = {
  size: 400,
  heightAt: (x) => heightOf(x),
  normalAt: (x) => normalOf(x),
  sampleAt: (x, z) => ({
    height: heightOf(x),
    slope: 1 - normalOf(x).y,
    surface: Math.abs(x - 2) < 3 && Math.abs(z) < 3 ? 'spring' : 'snow',
    zone: x > 16 ? 'ridge' : 'hearth',
  }),
};

export const makeEnv = (abilities: Partial<PlayerAbilities> = {}, gusting = false): PlayerEnvironment => ({
  terrain,
  abilities: { sprint: true, sled: false, lantern: true, ...abilities },
  gusting,
});

export const input = (over: Partial<InputFrame> = {}): InputFrame => ({ ...emptyInput(0), ...over });

export const spawn = (
  x: number,
  o: { y?: number; grounded?: boolean; stamina?: number; max?: number } = {},
): PlayerState => {
  const s = createPlayerState({ x, y: o.y ?? heightOf(x) + 0.02, z: 0 }, o.max ?? TUNING.staminaMaxBase);
  s.grounded = o.grounded ?? true; s.mode = s.grounded ? 'ground' : 'air';
  if (o.stamina !== undefined) s.stamina = o.stamina;
  return s;
};

export const FRAME = 1 / 60;

/** Nonsense input, seeded, for the two soak tests. */
export const wild = (rng: Rng): InputFrame => {
  const press = rng.next() < 0.08;
  return input({
    moveX: rng.range(-1, 1), moveZ: rng.range(-1, 1), jumpPressed: press,
    jumpHeld: press || rng.next() < 0.4, sprintHeld: rng.next() < 0.5,
    camYaw: rng.range(-Math.PI, Math.PI),
  });
};
