/**
 * Player-facing words the activities added in the polish pass: live readouts, the result line shown
 * when a run ends, and the hints for activities whose kind's hint does not fit them.
 *
 * Written by the writer. Numbers, times and names are filled in by the functions; the words around
 * them are the copy. Results show for about three seconds, so each is one short line.
 */

/** "1:05" or "24s": the same clock the activity panel shows. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

/** Where the arc was when a throw fell short or sailed over, by which way the release missed. */
/** "a Grayling", "an Arctic Char". */
const article = (name: string): string => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);

const ARC_WAS = {
  short: { early: 'the arc was still growing', late: 'the arc had shrunk back' },
  long: { early: "the arc hadn't shrunk enough", late: 'the arc grew past it' },
} as const;

import type { VillagerBest } from '../../data/villagerBests';
import { KEY } from '../../core/keys';

export const WORDS = {
  // Sled readout and result
  rings: (got: number, total: number): string => `Rings ${got} of ${total}`,
  /**
   * Which way the next ring is: critic round 18 took 0 of 5 and 3 of 12 steering by eye, and called the
   * rings luck. No key: the director's call (round 47), the opening teaches walking and steering.
   * The side of the run to keep to, not where the ring sits on screen: on a bend the run turns under it,
   * and critic round 66 read "Ring to your left" with the ring on the right. Steering by the screen there
   * misses it; keeping to the run's side takes it.
   */
  sledRing: (way: 'left' | 'right' | 'on'): string => (way === 'on' ? 'On line for the ring' : `Keep ${way} for the ring`),
  // "Your fastest yet" only beats an earlier run (critic round 8 was praised for a first run with one
  // ring), and a run that missed most rings says where they are instead.
  sledResult: (seconds: number, got: number, total: number, best: boolean, par = ''): string =>
    `Down in ${clock(seconds)} · ${got} of ${total} rings${par}${best ? ' · your fastest yet' : ''}`
    + (got * 2 < total ? `${!best && par.endsWith('!') ? '' : '.'} The rings sit on the fast line: steer through them.` : ''),
  // Race results and the hoop readout
  // Critic round 9 found the finish a bare line of text: it now says how the run stands against the last.
  raceResult: (seconds: number, best: number | null, par = ''): string =>
    `Over the line in ${clock(seconds)}${par}`
    // After a par that ends "!", no full stop as well: critic round 50 read "Ilsa's 15s!. Run it again".
    + (best === null ? `${par.endsWith('!') ? '' : '.'} Run it again to beat it.` : seconds < best ? ` · a new best, ${clock(best - seconds)} quicker` : ` · best ${clock(best)}`),
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
  /** Said once a hoop has been flown past rather than through. */
  hoopsThrough: (n: number): string => `${n} flown through`,
  gates: (next: number, total: number): string => `Gate ${next} of ${total}`,
  lanterns: (next: number, total: number): string => `Lantern ${next} of ${total}`,
  /**
   * Added to a result card the first time an activity is played to its end, whatever the result. "For
   * trying it" read as a consolation under a win (critic round 66, the woodpile stacked).
   */
  firstBells: (n: number): string => `+${n} bells for a first go`,
  /** Where the next gate is, from the camera's view: critic round 17 lost the lantern line with it behind them. */
  // The way, not the keys: the director's call (round 47). The opening teaches walking; live "hold D"
  // words on every gate were hand-holding.
  // Behind, it says which way round, as the compass does: critic round 52 read "Gate 5, 15 u behind you",
  // walked back toward the camera, and the view swung round with it, until the race was 420 u away.
  gateWay: (metres: number, way: 'ahead' | 'left' | 'right' | 'behind', round: 'left' | 'right' = 'left'): string =>
    `${Math.round(metres)} u ${way === 'ahead' ? 'ahead' : way === 'behind' ? `behind you, to your ${round}` : `on your ${way}`}`,
  /** A race walked away from: it ends, and says so. */
  raceLeft: "You left the course, so the run's off. The start is right where it was.",
  // Woodpile: a crooked press, before the log came square or after it swung past.
  woodEarly: 'Too soon. Let it swing square first',
  woodLate: 'Too late. Wait for it to swing back square',
  // While the log hangs square: the moment in words, not only the panel turning amber (critic round 8).
  woodNow: `Square — press ${KEY.interact}`,
  stoneNow: `Over the gap — press ${KEY.interact}`,
  /** The dam (damHand.ts): the current pushes the stone off its gap and Pip holds it there. */
  stoneSteer: (key: 'A' | 'D' | 'W' | 'S'): string =>
    `The current has it. Bring it back over the gap, ${{ A: 'to your left', D: 'to your right', W: 'away from you', S: 'toward you' }[key]}`,
  stoneHold: 'The current has it. Steer it back over the gap',
  cairnPick: 'The biggest stone still on the ground goes on next',
  cairnWrong: "That one won't sit there yet. A bigger one has to go under it",
  stoneOff: `Not over the gap. Hold it there first, then press ${KEY.interact}`,
  stoneMash: 'Easy: one press, once it sits over the gap',
  /** Pressed again straight after a press: the woodpile and the dam both take one press per swing. */
  buildMash: 'Easy: one press per swing. Watch for the lights',
  // Snowman, rolled: the ball is growing; it is big enough to push onto the spot; the face goes on with E.
  snowRoll: 'Keep rolling it bigger. It goes on the lit ring',
  snowPush: 'Big enough. Push it onto the lit ring',
  snowFace: `Press ${KEY.interact} to give it a face`,
  // Build results
  buildResult: {
    woodpile: "The pile's stacked straight. Bram can count it at last.",
    snowman: "Your snowman's up, and it's standing.",
    dam: 'The dam is whole again.',
    cairn: "Your stones are on the cairn now, on top of everyone else's.",
  } as Record<string, string>,
  // Fishing result; the fish name is the journal's own
  fishResult: (name: string): string => `You landed ${article(name)}.`,
  // Why a fish got away, said while the line settles (critic round 75 pressed eight times and never
  // learned whether it was early or late).
  fishNibble: 'Only a nibble. Wait for the float to go right under.',
  fishEarly: 'Too soon, that was only a nibble. Wait for the float to go right under.',
  fishLate: 'Too slow, it slipped off. Press the moment the float goes under.',
  // Hollis's errand: the line snags under the split pine's roots and comes up with the mitten.
  mittenResult: "The line snagged on the roots and came up with Hollis's mitten, soaked through.",
  // Photo result; `what` comes from photoSubjects.ts
  photoResult: (what: string): string => `You caught the ${what} on camera.`,
  // The photo panel's instruction, naming the subject (`what` from photoSubjects.ts).
  photoHint: (what: string): string => `Centre the ${what} in the frame, then press ${KEY.interact}.`,
  // The aurora's long exposure: holding the frame still; the frame has drifted off.
  exposeHold: 'Shutter open. Hold it still on the star',
  // It says which way: critic round 31 missed, saw the star drift off the frame, and found it by eye.
  exposeDrift: (key: 'A' | 'D' | 'W' | 'S'): string =>
    `It drifted. Ease it back ${{ A: 'to the left', D: 'to the right', W: 'up', S: 'down' }[key]}, onto the star`,
  // Throw result
  // A full round says so; a short one says how close and how to go again, as the bell does. Critic round
  // 35 was left with a bare "1 of 3 hits".
  throwResult: (hits: number, need: number): string => hits >= need
    ? `All ${need} down. There's not a snowman left standing.`
    : `${hits} of ${need} down${hits > 0 ? ', close' : ''}. Press ${KEY.interact} at the flag for another go.`,
  /** Critic round 17 rang it and read "1 of 1 hits", if anything: the bell is the point, not the count. */
  /** The bell's crosswind, said from the thrower's side: where it comes from and how hard. */
  bellWind: (from: 'left' | 'right', strength: number): string =>
    `Wind from the ${from}, ${strength >= 0.8 ? 'strong' : strength >= 0.45 ? 'steady' : 'light'}`,
  bellRang: 'The bell rang out across the square. Heads turned at the bakery.',
  bellSilent: `The bell never rang. Press ${KEY.interact} at the snowballs for another go.`,
  // Called for a moment as each throw lands.
  throwHit: 'Hit!',
  // Says which way the arc was going as well: critic round 25 read "Fell short: let go sooner" as
  // backwards, not seeing that the arc had already shrunk back past the target.
  throwWide: (side: 'left' | 'right' | 'short' | 'long' | null, timing?: 'early' | 'late'): string =>
    side === 'short' || side === 'long'
      ? `${side === 'short' ? 'Fell short' : 'Sailed over'}${timing ? `: ${ARC_WAS[side][timing]}. Let go ${timing === 'early' ? 'later' : 'sooner'}` : ''}`
      // And what to do about it: critic round 76 missed wide right and couldn't tell how to correct.
      : side ? `Missed, wide ${side}. Aim a touch more ${side === 'left' ? 'right' : 'left'}` : 'Missed, by a whisker',
  // The aim line's cue, until the throw is lined up; A turns the aim left, D right.
  throwTurn: (way: 'left' | 'right'): string => `Aim ${way}`,
  throwOn: `Lined up: hold ${KEY.interact}`,
  /** While E is held: the strength is the player's to judge, by the arc. */
  throwDrawing: 'Let go as the arc reaches it',
  /** While E is held and the arc is bold: letting go now hits. */
  throwNow: 'Let go!',
  // The big cues in the middle of the view (ActivityReadout.cue): the moment, and the key.
  cueBite: `Now! Press ${KEY.interact}`,
  cueSquare: `Square! Press ${KEY.interact}`,
  cueGap: `Over the gap! Press ${KEY.interact}`,
  /** A hoop well above or below the glide: flap to climb, or let the glide go a moment to sink. */
  hoopHeight: (dy: number): string => (dy > 0 ? `${Math.round(dy)} u above you: flap (${KEY.jump})` : `${Math.round(-dy)} u below you: ease off ${KEY.jump} to sink`),
  // Skate result
  skateResult: (seconds: number): string => `You went down on the ice after ${seconds.toFixed(1)}s. Get up and go again whenever you like.`,
  skateLap: 'You got all the way round the Reach without falling once.',
  // The way Pip is tipping; righting it is the player's to do (no key named, the director's call, round 47).
  skateTip: (side: 'left' | 'right'): string => `Tipping ${side}`,
  /** Off the edge on the ice, large in the middle of the view. */
  cueSkate: (side: 'left' | 'right'): string => `Tipping ${side}!`,
  skateSteady: 'Steady',
  /** Pip rode out a wobble that would have been a fall; `left` more of those before one is. */
  skateCaught: (left: number): string => `Whoa, caught it${left === 0 ? '. Next one is a fall' : ''}`,
  // Kite readouts and result
  kiteLow: 'Keep it in the rising snow',
  // Out of the lift: which way it is. No key named (the director's call, round 47).
  kiteLift: (side: 'left' | 'right'): string => `Lift is ${side}`,
  // Shown while the kite is inside the rising snow and climbing.
  kiteRising: 'In the lift. Up it goes',
  // Counts the hold down: critic round 29 read "Hold it there" with no idea for how long.
  // In words, not "5s": the panel's own clock follows it, and "5s more · 7s" read as two timers.
  kiteHigh: (left: number): string => `Over the crest lights. Hold it there, ${left === 1 ? 'one more second' : `${left} more seconds`}`,
  kiteResult: 'You held it above the crest, steady as a weathervane.',
} as const;

/** Hints for activities whose kind's hint would be wrong for them, by activity id. */
export const HINT_FOR_ID: Readonly<Record<string, string>> = {
  // Sinking is said up front: critic round 38 held Space in a thermal for 17 s and was told to ease off only
  // once it was far above the hoops.
  'peak-thermal-flight': `Run down the slope toward the first hoop and press ${KEY.jump} to jump. Hold ${KEY.jump} to glide; warm air lifts you, so let go of ${KEY.jump} to sink to a hoop below. The hoops weave left and right: steer for each one.`,
  'ridge-kite': `${KEY.steer} keep the kite in the rising snow. In it, the kite climbs. Hold it above the crest lights until they are all lit.`,
  'kettles-otter-slide': `${KEY.steer} steer. Keep off the edges, and ride through the rings for speed.`,
  'reach-sled-hill': `${KEY.steer} steer. Keep off the edges, and ride through the rings for speed.`,
  'hearth-kindling': `Each log swings over the pile. Press ${KEY.interact} when it hangs square.`,
  'hamlet-bell-throw': `Wind blows across the square and shifts after every throw: the arrow over the bell shows it. Aim into the wind, then hold ${KEY.interact} and let go on the arc.`,
  'kettles-dam-build': `The current pushes each stone off its gap. Hold it there with the move keys, then press ${KEY.interact} to set it.`,
  'ridge-cairn': `Everyone who climbs to the mast leaves a stone here. Your four lie beside it: A / D picks one, and ${KEY.interact} sets it on top, the biggest first and the smallest last.`,
  'hamlet-snowman': `Walk to roll a ball bigger, then push it onto the lit ring. Three balls, then ${KEY.interact} for the face.`,
};
