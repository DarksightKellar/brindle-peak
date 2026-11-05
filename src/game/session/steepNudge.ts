/**
 * A word when Pip leans into a face too steep to walk.
 *
 * Critic round 21 pushed up toward Brindle Peak off the trail, met the north face, and stood against
 * it with nothing happening and nothing said, then gave up. A slope Pip can't walk is a boundary on
 * purpose (the trail and its posts are the way up), so the game now says so: after a couple of
 * seconds of pushing and going nowhere, once in a while.
 */

/** Seconds of pushing without moving before the word. */
const PUSH_FOR = 1.6;
/** Seconds before it can be said again. */
const QUIET_FOR = 25;
/** Under this many units a second, Pip is going nowhere. */
const STUCK_SPEED = 0.6;

export const STEEP_WORDS = 'Too steep to climb here. The trail goes round: follow the lantern posts.';

export interface SteepNudge {
  /**
   * Once a frame: whether the stick is pushed into ground too steep even to climb, and Pip's speed.
   * Returns the words when due.
   */
  update(dt: number, intoSteep: boolean, speed: number): string | null;
}

export function createSteepNudge(): SteepNudge {
  let pushed = 0;
  let quiet = 0;
  return {
    update(dt, intoSteep, speed): string | null {
      quiet = Math.max(0, quiet - dt);
      pushed = intoSteep && speed < STUCK_SPEED ? pushed + dt : 0;
      if (pushed < PUSH_FOR || quiet > 0) return null;
      pushed = 0;
      quiet = QUIET_FOR;
      return STEEP_WORDS;
    },
  };
}
