/**
 * The chase heading: which way the camera looks, and so which way W walks (move.ts measures input
 * against it when a key goes down).
 *
 * Yaw is a leash, not a spring toward the player's facing. The camera turns only by as much as Pip
 * moves across it: a step of `lateral` units sideways turns the view by about LEASH * lateral / dist.
 * The old spring eased toward `facing` every frame, standing still included, so one tap of A or D
 * (which turns Pip a quarter) swung the whole view a quarter over the next few seconds, and the view
 * kept drifting through conversations. With the leash a tap turns the view a couple of degrees and
 * standing still turns nothing at all.
 *
 * The leash alone never turned for a walk straight at the lens: the critic held S and marched at the
 * camera for minutes, and circled the mast at the peak without once seeing it. So while Pip keeps
 * walking, the view also comes round behind the way Pip faces (`align`), slowly, the way A Short
 * Hike's camera follows a walk: after a moment of walking (ALIGN_WAIT), most of the way in a couple
 * of seconds, never faster than ALIGN_MAX. A full about-turn takes about four seconds.
 *
 * That turn does not turn the walk with it: move.ts latches a held key's direction in the world when
 * it goes down, so holding S the bird walks on in a straight line while the camera comes round behind
 * it, and the next press means what the screen shows.
 *
 * Q and R turn the view by hand (`look`, an axis: +1 turns right), and hold off the align for a
 * while after (ALIGN_HOLD). Two eased turns sit on top:
 *  - `steer`, called every frame while it holds: an activity's aim (a throw) swings the view behind it;
 *  - `settle`, called once: after a conversation the view had been left wherever the two-shot stood, so
 *    the first press of W walked Pip away from the next goal ("49 u · behind you" right after Edda).
 *    It eases round behind Pip toward the goal over about a second. Any manual turn takes over at once.
 * Reduce-motion keeps the leash and the hand turns but not the align: nothing turns by itself.
 */

import { shortestTurn } from './shot';

/** How hard the leash tows. 1 would keep the camera exactly where it stood; less lets it slide. */
const LEASH = 0.6;
/** A jump farther than this in one frame is a teleport or a load, not a walk: it turns nothing. */
const TELEPORT = 4;
/** Manual turn rate at full hold (about 95 degrees a second) and how fast it gets there. */
const LOOK_RATE = 1.65;
const LOOK_RAMP = 0.07;
/** How fast `steer` swings the view round: most of the way in about half a second. */
const TURN_TAU = 0.18;
/** The settle: a breath after a conversation, not a cut. Most of the way in a second, done or given up by MAX. */
const SETTLE_TAU = 0.5;
const SETTLE_MAX = 2.5;
const SETTLE_DONE = 0.01;
/** The align: walking faster than WALKING (u/s) for ALIGN_WAIT s, then easing in over ALIGN_IN s. */
const WALKING = 2;
const ALIGN_WAIT = 0.35;
const ALIGN_IN = 0.6;
/** Its pace at walking speed (WALK u/s): the gap closes with this time constant, capped at ALIGN_MAX rad/s. */
const WALK = 6.5;
const ALIGN_TAU = 1.4;
const ALIGN_MAX = 0.8;
/** After a hand on Q or R, the align waits this long. */
const ALIGN_HOLD = 2.5;

export interface Heading {
  yaw(): number;
  /**
   * One frame. `held` stops the manual turn and the align (the viewfinder owns A and D then). Returns
   * true when Pip moved farther than a step since the last frame: a teleport or a load, which callers
   * snap through.
   */
  update(
    step: number, at: { x: number; z: number }, facing: number, dist: number, look: number, held: boolean, reduced: boolean,
  ): boolean;
  /** Swing toward this yaw on the next update. Call each frame. */
  steer(yaw: number): void;
  /** Ease round to this yaw over the next second or so. Call once. */
  settle(yaw: number): void;
}

export function createHeading(): Heading {
  let yaw = 0;
  let turn = 0;
  let lastX = 0;
  let lastZ = 0;
  let primed = false;
  let steer: number | null = null;
  let settle: { yaw: number; left: number } | null = null;
  let walking = 0;
  let hold = 0;

  /** The align's turn this frame: toward `facing`, by how long and how fast Pip has been walking. */
  const align = (step: number, facing: number, speed: number): number => {
    if (speed < WALKING) {
      walking = 0;
      return 0;
    }
    walking += step;
    const weight = Math.min(1, Math.max(0, (walking - ALIGN_WAIT) / ALIGN_IN)) * Math.min(1.5, speed / WALK);
    const gap = shortestTurn(yaw, facing);
    const rate = Math.min(ALIGN_MAX, Math.abs(gap) / ALIGN_TAU) * weight;
    return Math.sign(gap) * Math.min(Math.abs(gap), rate * step);
  };

  return {
    yaw: () => yaw,
    steer: (next) => { steer = next; },
    settle: (next) => { settle = { yaw: next, left: SETTLE_MAX }; },
    update(step, { x, z }, facing, dist, look, held, reduced): boolean {
      // The first frame starts behind the bird, whichever way it faces.
      if (!primed) {
        yaw = facing;
        lastX = x;
        lastZ = z;
        primed = true;
      }
      // The leash: only movement across the view turns it. right = (-cos yaw, sin yaw), as in move.ts.
      const mx = x - lastX;
      const mz = z - lastZ;
      lastX = x;
      lastZ = z;
      const jumped = mx * mx + mz * mz >= TELEPORT * TELEPORT;
      if (!jumped) yaw -= (LEASH * (-Math.cos(yaw) * mx + Math.sin(yaw) * mz)) / dist;

      const want = held ? 0 : look * LOOK_RATE;
      turn = reduced ? want : turn + (want - turn) * (1 - Math.exp(-step / LOOK_RAMP));
      yaw -= turn * step;
      if (Math.abs(want) > 0.05) hold = ALIGN_HOLD;
      hold = Math.max(0, hold - step);
      // A hand on Q or R, or an activity's aim, outranks the settle.
      if (settle && (Math.abs(want) > 0.05 || steer !== null || jumped)) settle = null;
      const speed = jumped || step <= 0 ? 0 : Math.hypot(mx, mz) / step;
      if (steer !== null) {
        yaw += shortestTurn(yaw, steer) * (reduced ? 1 : 1 - Math.exp(-step / TURN_TAU));
        steer = null;
      } else if (settle) {
        const d = shortestTurn(yaw, settle.yaw);
        yaw += d * (reduced ? 1 : 1 - Math.exp(-step / SETTLE_TAU));
        settle.left -= step;
        if (reduced || Math.abs(d) < SETTLE_DONE || settle.left <= 0) settle = null;
      } else if (!held && !reduced && hold <= 0) {
        yaw += align(step, facing, speed);
      }
      yaw = shortestTurn(0, yaw); // kept in one turn either way
      return jumped;
    },
  };
}
