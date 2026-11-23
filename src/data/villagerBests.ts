/**
 * A villager's best on each timed run: something to beat on a first go.
 *
 * Critics rounds 36 and 37 found the runs close to autopilot: the words name every key, so following them
 * finishes the run and nothing says whether it was a good one. Each run now has a time or a count someone
 * in the valley set, said as the run starts and measured against at the end. Beating it is the reward;
 * missing it costs nothing.
 *
 * Set against runs in the game: sprinting straight at each gate, the Deer Trail takes 9.4 s, and walked
 * it is over 20 s, so its best needs the sprint a race leaves free, with room for a player's steering.
 * The Chimney Scramble goes up the crag's three walls now, and climbing has one speed: run cleanly it
 * takes 22 s, so Sable's 26 s leaves room for a missed gate and nothing more. Ivy has not cleaned her
 * slide yet, so it can be beaten.
 */

export interface VillagerBest {
  who: string;
  /** A time to beat, in seconds. */
  seconds?: number;
  /** Or a count to match: rings or hoops through. */
  count?: number;
  noun?: 'rings' | 'hoops';
}

export const VILLAGER_BESTS: Readonly<Record<string, VillagerBest>> = {
  'pinewind-deer-run': { who: 'Ilsa', seconds: 15 },
  // 25 since critic round 111's course fix: as long as before, but downhill and one way, with no 3 u climb.
  'ridge-chimney-race': { who: 'Sable', seconds: 25 },
  'peak-thermal-flight': { who: 'Edda', count: 8, noun: 'hoops' },
  'reach-sled-hill': { who: 'Skiff', count: 5, noun: 'rings' },
  'kettles-otter-slide': { who: 'Ivy', count: 10, noun: 'rings' },
};
