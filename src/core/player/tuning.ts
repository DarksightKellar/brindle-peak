/**
 * Player feel constants. The single source of truth for movement numbers; no magic
 * numbers are permitted in `step.ts` (ARCHITECTURE §1.8).
 *
 * Every value here is binding from GDD REVISION v1.1 R1/R6/R7. The only one with an
 * internal tension is `jumpSpeed`: 9.0 u/s against `gravityRise` 22 gives an apex of
 * 1.84 u after 0.41 s to the top, where the design note quotes "~2.0 u over ~0.38 s".
 * The number is the binding part, so 9.0 ships; the arc is 8 % lower and 8 % longer than
 * the prose. Raising it to 9.4 would hit 2.0 u exactly. Reported to the Director.
 */

import type { PlayerTuning } from '../contracts';

export const TUNING: PlayerTuning = {
  walkSpeed: 6.5,
  // 1.46x over walk read as too slow to be worth using after a play test, and the route walk had
  // already measured sprint as a 3% time saving for 427 frames of forced exhaustion. Double walk.
  sprintSpeed: 13.0,

  groundAccelTime: 0.18,
  groundDecelTime: 0.10,
  airControl: 0.65,
  frictionIce: 0.15,

  gravityRise: 22,
  gravityFall: 38,
  jumpSpeed: 9.0,

  /*
   * Flight, retuned after play. The report was specific: the flap is too weak to see, there is no
   * leeway when a jump is botched, and the bird should travel much further without becoming a
   * helicopter.
   *
   * flapSpeed  2.6 -> 4.2   each beat gains real height instead of a shrug
   * maxFlaps   2   -> 3     one spare beat for a mistimed hop, which is the "leeway when I flop"
   * glideFallSpeed 3.0 -> 1.6  a glide that sinks at half speed roughly doubles the distance
   * glideDrift 4.0 -> 7.5   and it actually carries forward
   *
   * Still finite: three beats and a glide, then the ground. Stamina is the ceiling, not the sky.
   */
  flapSpeed: 4.2,
  /** Forward shove per beat. A flap is a push, not only a lift. */
  flapForward: 3.4,
  glideHoldThreshold: 0.15,
  glideFallSpeed: 1.6,
  glideDrift: 9.5,

  climbSpeed: 2.2,
  climbMaxSlope: 0.8,
  mantleReach: 0.4,
  mantleDuration: 0.25,

  coyoteTime: 0.12,
  jumpBufferTime: 0.12,

  /** One number for flap, jump and sprint. Doubled on request: eight beats, or a long sprint. */
  staminaMaxBase: 8,
  drainFlap: 1.0,
  drainJump: 0.5,
  drainClimb: 1.6,
  // Half what it was: critic round 24 ran the Frozen Reach and the Brindle approach into WINDED, on the
  // long walks where running is the point. About 18 s of sprint from a fresh bar.
  drainSprint: 0.45,

  regenIdle: 2.4,
  regenMoving: 1.2,
  regenSoak: 9.0,
  regenDelay: 0.35,
  /** 4 * 0.34 = 1.36 >= drainFlap 1.0, so the gust floor always buys a flap (GDD R6). */
  staminaFloorRatio: 0.34,

  stepHeight: 0.6,
  sledSpeed: 16,
  sledSteer: 2.2,
  downhillBias: 9.0,
};
