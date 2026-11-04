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

export const WORDS = {
  // Sled readout and result
  rings: (got: number, total: number): string => `Rings ${got} of ${total}`,
  sledResult: (seconds: number, got: number, total: number, best: boolean): string =>
    `Down in ${clock(seconds)} · ${got} of ${total} rings${best ? ' · your fastest yet' : ''}`,
  // Race results and the hoop readout
  raceResult: (seconds: number): string => `Over the line in ${clock(seconds)}`,
  lanternResult: (lit: number): string => `${lit} lanterns lit, all the way up the ridge`,
  hoopResult: (seconds: number, through: number, total: number): string =>
    `Down in ${clock(seconds)} · through ${through} of ${total} hoops`,
  hoops: (next: number, total: number): string => `Hoop ${next} of ${total}`,
  gates: (next: number, total: number): string => `Gate ${next} of ${total}`,
  lanterns: (next: number, total: number): string => `Lantern ${next} of ${total}`,
  // Woodpile: a crooked press, before the log came square or after it swung past.
  woodEarly: 'Too soon. Let it swing square first',
  woodLate: 'Too late. Wait for it to swing back square',
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
  exposeDrift: 'It drifted. Ease it back onto the star',
  // Throw result
  throwResult: (hits: number, need: number): string => `${Math.min(hits, need)} of ${need} hits`,
  // Skate result
  skateResult: (seconds: number): string => `Upright for ${seconds.toFixed(1)}s`,
  // Kite readouts and result
  kiteLow: 'Keep it in the rising snow',
  // Shown while the kite is inside the rising snow and climbing.
  kiteRising: 'In the lift. Up it goes',
  kiteHigh: 'Over the crest lights. Hold it there',
  kiteResult: 'Held above the crest, steady as a weathervane.',
} as const;

/** Hints for activities whose kind's hint would be wrong for them, by activity id. */
export const HINT_FOR_ID: Readonly<Record<string, string>> = {
  'peak-thermal-flight': 'Run off the edge and press Space to jump. Hold Space to glide, and steer through the hoops.',
  'ridge-kite': 'A / D keep the kite in the rising snow. In it, the kite climbs. Hold it above the crest lights.',
  'kettles-otter-slide': 'A / D steer. Keep off the edges, and ride through the rings for speed.',
  'reach-sled-hill': 'A / D steer. Keep off the edges, and ride through the rings for speed.',
  'hearth-kindling': 'Each log swings over the pile. Press E when it hangs square.',
  'hamlet-snowman': 'Walk to roll a ball bigger, then push it onto the lit ring. Three balls, then E for the face.',
};
