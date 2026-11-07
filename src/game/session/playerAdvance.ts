/**
 * Moving the body one frame through the world, and the sound of it.
 *
 * The order here is load-bearing and was previously buried in the middle of `session.update`: integrate
 * the step, clamp to the play area, resolve the solid world, and only then decide whether the feet were
 * moving fast enough to make a noise. Get the clamp after the collision (or the collision after the
 * footstep) and a player pinned against a boulder keeps walking into it, or footstep audio fires from a
 * body that never moved.
 *
 * This is deliberately not "the player system": stepPlayer owns physics and is pure. This is the frame
 * wiring around it — the sampler, the colliders, the audio — which is why it lives in game/session and
 * not in core.
 */

import type { GameState, InputFrame, PlayerState } from '../../core/contracts';
import { stepPlayer } from '../../core/player/step';
import { TUNING } from '../../core/player/tuning';
import { footstepRate } from '../../core/player/stride';
import type { Collider } from '../../core/player/collide';
import { clampToWorld, applySolidWorld } from './worldRules';
import { stepSfx } from './router';

/** The terrain and audio shapes, borrowed from the functions that consume them. */
type Terrain = Parameters<typeof stepPlayer>[4]['terrain'];
type Sfx = (name: ReturnType<typeof stepSfx>) => void;

export interface AdvanceDeps {
  player: PlayerState;
  input: InputFrame;
  dt: number;
  elapsed: number;
  sampler: Terrain;
  abilities: GameState['abilities'];
  /** Ridge gusts push the body; `stepPlayer` reads this, it is not just weather dressing. */
  gusting: boolean;
  worldSize: number;
  colliders: readonly Collider[];
  sfx: Sfx;
}

export function advancePlayer(d: AdvanceDeps): void {
  const { player, input, dt, sampler } = d;
  const from = { x: player.pos.x, z: player.pos.z };

  stepPlayer(player, input, dt, TUNING, {
    terrain: sampler,
    abilities: d.abilities,
    gusting: d.gusting,
  });

  clampToWorld(player, d.worldSize);
  applySolidWorld(player, d.colliders, sampler, from);

  if (!player.grounded || dt <= 0) return;
  // Ground actually covered, not the speed the legs want: pushing into a wall or a rock keeps the
  // velocity up while Pip goes nowhere, and a walk that goes nowhere makes no sound.
  const speed = Math.hypot(player.pos.x - from.x, player.pos.z - from.z) / dt;
  if (speed <= 1.2) return;
  // A footfall each time the stride clock passes a whole step. The clock runs at the legs' own pace
  // (core/player/stride.ts), so a sprint quickens the footsteps as much as it quickens the legs.
  const before = strides.get(player) ?? 0;
  const after = before + dt * footstepRate(speed, true, TUNING);
  strides.set(player, after % 1000);
  if (Math.floor(after) !== Math.floor(before)) d.sfx(stepSfx(sampler.sampleAt(player.pos.x, player.pos.z).surface));
}

/** Footsteps taken, as a running count, per body. */
const strides = new WeakMap<PlayerState, number>();
