/**
 * Named spots a quest step can send Pip to, smaller than a zone.
 *
 * A zone is the wrong size for "go and stand there": Kettle Springs is 260 units across, so "listen to
 * the hot pools" as a zone visit ticked on the zone's rim, out of sight of any pool. A step waiting on
 * `{ kind: 'reached', id }` passes when Pip next steps inside one of these circles (worldRules.ts emits
 * `place:reached` on each arrival).
 */

import type { Vec2, ZoneId } from '../core/contracts';

export interface PlaceDef {
  id: string;
  zone: ZoneId;
  /** Centre of the spot. */
  pos: Vec2;
  /** How close counts as being there. */
  radius: number;
}

export const PLACES: readonly PlaceDef[] = [
  // The five pools (world/landmarks.ts SPRING_POOLS) sit within about 27 units of this point; inside
  // the circle Pip is among them, with steam on both sides. Move it with the pools.
  { id: 'kettle-pools', zone: 'kettles', pos: { x: -39, z: 60 }, radius: 30 },
];
