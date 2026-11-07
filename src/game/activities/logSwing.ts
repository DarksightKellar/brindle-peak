/**
 * Laying a log square: the one bit of skill in Bram's woodpile.
 *
 * The woodpile used to be four presses on the spot, two logs a press. Bram's whole complaint is that
 * the rows lean, so each log now comes up off the heap and hangs over its place on the crib, swinging
 * a little either side of square. Press F as it comes square and it drops into the notch; press while
 * it is crooked and it lands askew, rolls off, and comes back up to try again. Nothing is lost but a
 * second.
 *
 * Round 3: the square moment was a sliver (~0.18 s) on a plain pendulum, and a press a frame early
 * dropped the log. The swing now lingers through square (it is a pendulum shaped to dwell at the
 * bottom), so a player who reads the swing and presses on the beat lands it.
 *
 * Round 4: mashing E stacked the pile. A press just before square was held and laid when the log got
 * there, so a stream of presses always had one in that window, and the window was open more than a
 * third of each swing. Now the window is narrower, nothing is held, and a press that follows another
 * within `mash` seconds is crooked whatever the log is doing: only a deliberate press lays a log.
 *
 * Pure numbers, so the rule can be tested without a world.
 */

export const SWING = {
  /** Widest the log swings off square, radians. */
  amp: 0.6,
  /** Seconds for a full swing on the bottom layer; each layer up is a touch quicker. */
  period: 2.6,
  quicken: 0.08,
  /** Within this many radians of square the log drops in straight: about a third of a second per pass. */
  square: 0.13,
  /** A press this soon after the last one is a mash, and lands crooked. */
  mash: 0.3,
  /** Seconds a crooked log takes to land, roll off and come back up. */
  slip: 0.8,
  /** Metres the log hangs above its place while it swings. */
  hover: 0.9,
} as const;

/**
 * The log's angle off square `t` seconds after it was lifted, on crib layer `layer`. Starts crooked.
 * Squaring the cosine keeps the turn-arounds brisk and lets the log hang near square on each pass.
 */
export function swingAt(t: number, layer: number): number {
  const period = Math.max(1.9, SWING.period - layer * SWING.quicken);
  const c = Math.cos((t / period) * Math.PI * 2);
  return SWING.amp * c * Math.abs(c);
}

/** Which way a crooked press missed: 'early' while the log is still swinging in toward square. */
export function missSide(t: number, layer: number): 'early' | 'late' {
  return Math.abs(swingAt(t + 0.02, layer)) < Math.abs(swingAt(t, layer)) ? 'early' : 'late';
}

export function isSquare(angle: number): boolean {
  return Math.abs(angle) <= SWING.square;
}

/**
 * Where a crooked log is `age` seconds into its slip: it drops onto the crib, tips further over as it
 * rolls off the edge, then is lifted back up to the hover. `drop` is metres above the resting place.
 */
export function slipAt(age: number, angle: number): { drop: number; angle: number; tilt: number } {
  const t = Math.max(0, Math.min(1, age / SWING.slip));
  if (t < 0.35) {
    const k = t / 0.35;
    return { drop: SWING.hover * (1 - k * k), angle, tilt: 0 };
  }
  if (t < 0.65) {
    const k = (t - 0.35) / 0.3;
    return { drop: 0.05, angle: angle * (1 + k * 0.6), tilt: Math.sign(angle || 1) * k * 0.5 };
  }
  const k = (t - 0.65) / 0.35;
  return { drop: SWING.hover * k, angle: angle * 1.6 * (1 - k) + SWING.amp * k, tilt: Math.sign(angle || 1) * 0.5 * (1 - k) };
}
