/**
 * Compass words and distances — the only place a direction becomes a word.
 *
 * World convention (docs/GUIDE.md, `src/data/zones.ts`): +x is east, -z is north. So the bearing
 * angle is `atan2(east, north)`, 0 pointing north and a quarter turn clockwise per octant.
 *
 * Pure arithmetic: no clock, no DOM, no randomness. A wrong bearing is a lie on screen, so this is
 * unit-tested rather than eyeballed.
 */

export type CompassWord =
  | 'north'
  | 'northeast'
  | 'east'
  | 'southeast'
  | 'south'
  | 'southwest'
  | 'west'
  | 'northwest';

/** Clockwise from north, one per octant. */
const WORDS: readonly CompassWord[] = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
];

/** The octant a world-space offset falls in. `dx` is east, `dz` is south. */
export function compassWord(dx: number, dz: number): CompassWord {
  const angle = Math.atan2(dx, -dz);
  const octant = Math.round(angle / (Math.PI / 4));
  return WORDS[((octant % 8) + 8) % 8];
}

/** Whole world units, as the player reads them: "210 u". */
export const formatDistance = (units: number): string => `${Math.round(units)} u`;
