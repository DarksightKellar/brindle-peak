/**
 * A word when Pip leans into a face and goes nowhere.
 *
 * Critic round 21 pushed up toward Brindle Peak off the trail, met the north face, and stood against
 * it with nothing happening and nothing said, then gave up. A slope Pip can't walk is a boundary on
 * purpose (the trail and its posts are the way up), so the game now says so: after a couple of
 * seconds of pushing and going nowhere, once in a while.
 *
 * Critic round 30 met the other stall: a face Pip can climb, with the breath ring empty. The climb
 * takes breath, so holding W only twitched at the foot of it, and the critic took it for a slope W
 * can't walk. That one says what is missing instead.
 */

/** Seconds of pushing without moving before the word. */
const PUSH_FOR = 1.6;
/** Seconds before it can be said again. */
const QUIET_FOR = 25;
/** Under this many units a second, Pip is going nowhere. */
const STUCK_SPEED = 0.6;
/**
 * Speed is averaged over about this long (s): out of breath the climb twitches, a frame or two up the
 * face at climbing speed and then off, and a frame-by-frame speed called each twitch "moving".
 */
const SPEED_TAU = 0.5;

export const STEEP_WORDS = 'Too steep to climb here. The trail goes round: follow the lantern posts.';
export const BREATH_WORDS = 'Out of breath for the climb. Stand a moment and let it come back, then push into the slope again.';
/**
 * Out of breath on a face off the trail, the climb is not the way: critic round 99 sprinted at Windscar's
 * rock below the trail, was winded there twice, and read "push into the slope again".
 */
export const OFF_TRAIL_WORDS = "Out of breath on the rock. This face isn't the way up: the trail goes round it, past the lantern posts. The compass follows it.";
/** Further than this from the trail (u), and no further than OFF_TRAIL_FAR, a winded climb is off it. */
export const OFF_TRAIL_NEAR = 8;
export const OFF_TRAIL_FAR = 90;

/** What Pip is pushing into: a face too steep even to climb, a climb with no breath for it, or neither. */
export type Stuck = 'wall' | 'breath' | null;

export interface SteepNudge {
  /** Once a frame: what the stick is pushed into, and Pip's speed. Returns the words when due. */
  /** `offTrail`: Pip is near the trail but not on it, so a winded climb gets OFF_TRAIL_WORDS. */
  update(dt: number, into: Stuck, speed: number, offTrail?: boolean): string | null;
}

export function createSteepNudge(): SteepNudge {
  let pushed = 0;
  let quiet = 0;
  let pace = 0;
  return {
    update(dt, into, speed, offTrail = false): string | null {
      quiet = Math.max(0, quiet - dt);
      pace += (speed - pace) * Math.min(1, dt / SPEED_TAU);
      pushed = into !== null && pace < STUCK_SPEED ? pushed + dt : 0;
      if (into === null || pushed < PUSH_FOR || quiet > 0) return null;
      pushed = 0;
      quiet = QUIET_FOR;
      return into === 'wall' ? STEEP_WORDS : offTrail ? OFF_TRAIL_WORDS : BREATH_WORDS;
    },
  };
}
