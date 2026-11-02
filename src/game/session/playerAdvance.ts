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

  stepPlayer(player, input, dt, TUNING, {
    terrain: sampler,
    abilities: d.abilities,
    gusting: d.gusting,
  });

  clampToWorld(player, d.worldSize);
  applySolidWorld(player, d.colliders, sampler);

  if (!player.grounded) return;
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (speed <= 1.2) return;
  // Fire on the half-beat boundary only, so a held walk produces a rhythm instead of a buzz per frame.
  const beat = Math.floor(d.elapsed * 2.4);
  const previous = Math.floor((d.elapsed - dt) * 2.4);
  if (beat !== previous) d.sfx(stepSfx(sampler.sampleAt(player.pos.x, player.pos.z).surface));
}
