/**
 * Player-facing words the activities added in the polish pass: live readouts, the result line shown
 * when a run ends, and the hints for activities whose kind's hint does not fit them.
 *
 * Written by the writer. Numbers, times and names are filled in by the functions; the words around
 * them are the copy. Results show for about three seconds, so each is one short line.
 */

/**
 * The keys that walk toward something at `turn` radians from the view's heading, left positive. A held
 * key walks one straight line, fixed in the world when it goes down (core/player/move.ts): nothing
 * curves, so the words name the nearest of the eight lines two keys can walk, always within about 22
 * degrees of the target. Behind, that ends in S, straight back; the view comes round behind Pip as it goes.
 */
export function keyToward(turn: number, offAhead = false): string {
  // 0 ahead .. 4 straight back; a target the words call "on your left" is never "hold W".
  const eighth = Math.max(offAhead ? 1 : 0, Math.round(Math.abs(turn) / (Math.PI / 4)));
  const side = turn > 0 ? 'A' : 'D';
  return ['W', `W and ${side}`, side, `S and ${side}`, 'S'][Math.min(4, eighth)];
}

/** "1:05" or "24s": the same clock the activity panel shows. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

/** Where the arc was when a throw fell short or sailed over, by which way the release missed. */
const ARC_WAS = {
  short: { early: 'the arc was still growing', late: 'the arc had shrunk back' },
  long: { early: "the arc hadn't shrunk enough", late: 'the arc grew past it' },
} as const;

import type { VillagerBest } from '../../data/villagerBests';

export const WORDS = {
  // Sled readout and result
  rings: (got: number, total: number): string => `Rings ${got} of ${total}`,
  /**
   * Which way the next ring is: critic round 18 took 0 of 5 and 3 of 12 steering by eye, and called the
   * rings luck. The key is named until it has been used (`keys` false after two rings): critic round 26
   * steered by the words and never looked at the rings.
   */
  sledRing: (way: 'left' | 'right' | 'on', keys = true): string =>
    way === 'on' ? 'On line for the ring' : `Ring to your ${way}${keys ? `: hold ${way === 'left' ? 'A' : 'D'}` : ''}`,
  // "Your fastest yet" only beats an earlier run (critic round 8 was praised for a first run with one
  // ring), and a run that missed most rings says where they are instead.
  sledResult: (seconds: number, got: number, total: number, best: boolean, par = ''): string =>
    `Down in ${clock(seconds)} · ${got} of ${total} rings${par}${best ? ' · your fastest yet' : ''}`
    + (got * 2 < total ? '. The rings sit on the fast line: steer through them.' : ''),
  // Race results and the hoop readout
  // Critic round 9 found the finish a bare line of text: it now says how the run stands against the last.
  raceResult: (seconds: number, best: number | null, par = ''): string =>
    `Over the line in ${clock(seconds)}${par}`
    + (best === null ? '. Run it again to beat it.' : seconds < best ? ` · a new best, ${clock(best - seconds)} quicker` : ` · best ${clock(best)}`),
  lanternResult: (lit: number): string => `${lit} lanterns lit, all the way up the ridge`,
  hoopResult: (seconds: number, through: number, total: number, par = ''): string =>
    `Down in ${clock(seconds)} · through ${through} of ${total} hoops${par}`,
  /** A villager's best (data/villagerBests.ts), said as the run starts. */
  parStart: (b: VillagerBest): string =>
    b.seconds !== undefined ? `${b.who}'s best is ${clock(b.seconds)}.` : `${b.who} gets ${b.count} ${b.noun}.`,
  /** How a finished run stands against that best: a time beaten or not, a count matched or not. */
  parAfter: (b: VillagerBest, seconds: number, count: number): string => {
    if (b.seconds !== undefined) {
      return seconds < b.seconds
        ? ` · quicker than ${b.who}'s ${clock(b.seconds)}!`
        // Your gap first: critic round 40 found "Ilsa's 15s is 36.0s quicker" took a second read.
        : ` · ${(seconds - b.seconds).toFixed(1)}s off ${b.who}'s ${clock(b.seconds)}`;
    }
    const c = b.count ?? 0;
    return count > c ? ` · more than ${b.who}!` : count === c ? ` · as many as ${b.who}!` : ` · ${b.who} gets ${c}`;
  },
  hoops: (next: number, total: number): string => `Hoop ${next} of ${total}`,
  gates: (next: number, total: number): string => `Gate ${next} of ${total}`,
  lanterns: (next: number, total: number): string => `Lantern ${next} of ${total}`,
  /** Added to a result card the first time an activity is played to its end. */
  firstBells: (n: number): string => `+${n} bells for a first go`,
  /** Where the next gate is, from the camera's view: critic round 17 lost the lantern line with it behind them. */
  // Off to a side or behind, it names the keys that walk there (keyToward): "over your right
  // shoulder" (critic round 20) and "hold D to come round" (round 31) both left Pip walking off sideways.
  // Every way names its key, ahead too: critic round 35 read "6 u ahead" with no key and took it for none.
  gateWay: (metres: number, way: 'ahead' | 'left' | 'right' | 'behind', turn: number): string =>
    `${Math.round(metres)} u ${way === 'ahead' ? 'ahead' : way === 'behind' ? 'behind you' : `on your ${way}`}, hold ${keyToward(turn, way !== 'ahead')}`,
  // Woodpile: a crooked press, before the log came square or after it swung past.
  woodEarly: 'Too soon. Let it swing square first',
  woodLate: 'Too late. Wait for it to swing back square',
  // While the log hangs square: the moment in words, not only the panel turning amber (critic round 8).
  woodNow: 'Square — press E',
  stoneNow: 'Over the gap — press E',
  /** The dam (damHand.ts): the current pushes the stone off its gap and Pip holds it there. */
  stoneSteer: (key: 'A' | 'D' | 'W' | 'S'): string => `The current has it. Hold ${key} to bring it over the gap`,
  stoneHold: 'The current has it. Steer it back over the gap',
  stoneOff: 'Not over the gap. Hold it there first, then press E',
  stoneMash: 'Easy: one press, once it sits over the gap',
  /** Pressed again straight after a press: the woodpile and the dam both take one press per swing. */
  buildMash: 'Easy: one press per swing. Watch for the lights',
  // Snowman, rolled: the ball is growing; it is big enough to push onto the spot; the face goes on with E.
  snowRoll: 'Keep rolling it bigger. It goes on the lit ring',
  snowPush: 'Big enough. Push it onto the lit ring',
  snowFace: 'Press E to give it a face',
  // Build results
  buildResult: { woodpile: 'Stacked straight. Countable at last.', snowman: 'One snowman, standing.', dam: 'The dam is whole again.' } as Record<string, string>,
  // Fishing result; the fish name is the journal's own
  fishResult: (name: string): string => `${name}, landed.`,
  // Hollis's errand: the line snags under the split pine's roots and comes up with the mitten.
  mittenResult: "Snagged on the roots: Hollis's mitten, soaked through.",
  // Photo result; `what` comes from photoSubjects.ts
  photoResult: (what: string): string => `The ${what}, caught on camera.`,
  // The photo panel's instruction, naming the subject (`what` from photoSubjects.ts).
  photoHint: (what: string): string => `Centre the ${what} in the frame, then press E.`,
  // The aurora's long exposure: holding the frame still; the frame has drifted off.
  exposeHold: 'Shutter open. Hold it still on the star',
  // It says which way: critic round 31 missed, saw the star drift off the frame, and found it by eye.
  exposeDrift: (key: 'A' | 'D' | 'W' | 'S'): string => `It drifted. Ease it back onto the star: hold ${key}`,
  // Throw result
  // A full round says so; a short one says how close and how to go again, as the bell does. Critic round
  // 35 was left with a bare "1 of 3 hits".
  throwResult: (hits: number, need: number): string => hits >= need
    ? `All ${need} down. Not a snowman left standing.`
    : `${hits} of ${need} down${hits > 0 ? ', close' : ''}. Press E at the flag for another go.`,
  /** Critic round 17 rang it and read "1 of 1 hits", if anything: the bell is the point, not the count. */
  /** The bell's crosswind, said from the thrower's side: where it comes from and how hard. */
  bellWind: (from: 'left' | 'right', strength: number): string =>
    `Wind from the ${from}, ${strength >= 0.8 ? 'strong' : strength >= 0.45 ? 'steady' : 'light'}`,
  bellRang: 'The bell rang out across the square. Heads turned at the bakery.',
  bellSilent: 'The bell never rang. Press E at the snowballs for another go.',
  // Called for a moment as each throw lands.
  throwHit: 'Hit!',
  // Says which way the arc was going as well: critic round 25 read "Fell short: let go sooner" as
  // backwards, not seeing that the arc had already shrunk back past the target.
  throwWide: (side: 'left' | 'right' | 'short' | 'long' | null, timing?: 'early' | 'late'): string =>
    side === 'short' || side === 'long'
      ? `${side === 'short' ? 'Fell short' : 'Sailed over'}${timing ? `: ${ARC_WAS[side][timing]}. Let go ${timing === 'early' ? 'later' : 'sooner'}` : ''}`
      : side ? `Missed, wide ${side}` : 'Missed, by a whisker',
  // The aim line's cue, until the throw is lined up; A turns the aim left, D right.
  throwTurn: (way: 'left' | 'right'): string => `Aim ${way} (${way === 'left' ? 'A' : 'D'})`,
  throwOn: 'Lined up: hold E',
  /** While E is held: the strength is the player's to judge, by the arc. */
  throwDrawing: 'Let go as the arc reaches it',
  /** While E is held and the arc is bold: letting go now hits. */
  throwNow: 'Let go!',
  // The big cues in the middle of the view (ActivityReadout.cue): the moment, and the key.
  cueBite: 'Now! Press E',
  cueSquare: 'Square! Press E',
  cueGap: 'Over the gap! Press E',
  /** A hoop well above or below the glide: flap to climb, or let the glide go a moment to sink. */
  hoopHeight: (dy: number): string => (dy > 0 ? `${Math.round(dy)} u above you: flap (Space)` : `${Math.round(-dy)} u below you: ease off Space to sink`),
  // Skate result
  skateResult: (seconds: number): string => `Down on the ice after ${seconds.toFixed(1)}s. Up again whenever.`,
  skateLap: 'Round the Reach and upright the whole way.',
  // The meter's side, said as the key that rights it: "Balance right" read as the way to press. Once the
  // lap is under way the key steps back, and comes back when a fall is close.
  skateTip: (side: 'left' | 'right'): string => `Tipping ${side} — hold ${side === 'right' ? 'A' : 'D'}`,
  /** Off the edge on the ice, large in the middle of the view. */
  cueSkate: (side: 'left' | 'right'): string => `Hold ${side === 'right' ? 'A' : 'D'}!`,
  skateSteady: 'Steady',
  /** Pip rode out a wobble that would have been a fall; `left` more of those before one is. */
  skateCaught: (left: number): string => `Whoa, caught it${left === 0 ? '. Next one is a fall' : ''}`,
  // Kite readouts and result
  kiteLow: 'Keep it in the rising snow',
  // Out of the lift: which way it is, and the key that walks the kite there. Critic round 34 lost the
  // key once the kite had risen and was left with "Lift is left".
  kiteLift: (side: 'left' | 'right'): string => `Lift is ${side} — hold ${side === 'left' ? 'A' : 'D'}`,
  // Shown while the kite is inside the rising snow and climbing.
  kiteRising: 'In the lift. Up it goes',
  // Counts the hold down: critic round 29 read "Hold it there" with no idea for how long.
  // In words, not "5s": the panel's own clock follows it, and "5s more · 7s" read as two timers.
  kiteHigh: (left: number): string => `Over the crest lights. Hold it there, ${left === 1 ? 'one more second' : `${left} more seconds`}`,
  kiteResult: 'Held above the crest, steady as a weathervane.',
} as const;

/** Hints for activities whose kind's hint would be wrong for them, by activity id. */
export const HINT_FOR_ID: Readonly<Record<string, string>> = {
  // Sinking is said up front: critic round 38 held Space in a thermal for 17 s and was told to ease off only
  // once it was far above the hoops.
  'peak-thermal-flight': 'Run off the edge and press Space to jump. Hold Space to glide; warm air lifts you, so let go of Space to sink to a hoop below. The hoops weave left and right: steer for each one.',
  'ridge-kite': 'A / D keep the kite in the rising snow. In it, the kite climbs. Hold it above the crest lights until they are all lit.',
  'kettles-otter-slide': 'A / D steer. Keep off the edges, and ride through the rings for speed.',
  'reach-sled-hill': 'A / D steer. Keep off the edges, and ride through the rings for speed.',
  'hearth-kindling': 'Each log swings over the pile. Press E when it hangs square.',
  'hamlet-bell-throw': 'Wind blows across the square and shifts after every throw: the arrow over the bell shows it. Aim into the wind, then hold E and let go on the arc.',
  'kettles-dam-build': 'The current pushes each stone off its gap. Hold it there with the move keys, then press E to set it.',
  'hamlet-snowman': 'Walk to roll a ball bigger, then push it onto the lit ring. Three balls, then E for the face.',
};
