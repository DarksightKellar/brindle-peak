/**
 * Authored race courses: the gates each race runs through, in order, ending at the finish.
 *
 * The race used to be a seeded bearing and a 110 u straight line with nothing drawn on it, so
 * "Chimney Scramble ... to the top" ran flat west and nobody could tell where the course went.
 * Every course here was routed against the real heightfield and the real tree colliders, and each
 * leg was walked by the real player stepper (see the report that came with this file):
 *
 *   - no leg needs a slope steeper than the 0.35 walk limit in step.ts, so nothing needs stamina;
 *   - every gate stands on open ground, clear of trunks and rocks;
 *   - the course reads like its name: the deer trail winds through Pinewind, the chimney scramble
 *     goes round the foot of Nettle Chimney and up onto the ridge crest above it, the lantern ascent
 *     climbs the only walkable line up the north face, the thermal descent runs down off the peak.
 *
 * The start is the activity post (`ActivityDef.pos`); gates do not repeat it. Positions are world XZ.
 */

import type { ActivityDef, Vec2 } from '../../core/contracts';

/** How a gate is drawn. Lanterns stay lit once passed, which is the whole of "light the posts". */
export type GateLook = 'arch' | 'lantern' | 'hoop';

export interface RaceCourse {
  readonly gates: readonly Vec2[];
  /** Horizontal pass radius. Generous on purpose: a gate is a direction, not a needle to thread. */
  readonly radius: number;
  readonly look: GateLook;
  /** Absolute height of each gate's centre, for gates hung in the air; omitted for gates on the ground. */
  readonly heights?: readonly number[];
}

export const GATE_RADIUS = 4.5;

export const RACE_COURSES: Readonly<Record<string, RaceCourse>> = {
  // Down through the pines, round the bend at the bottom of the wood and back up the far side.
  'pinewind-deer-run': {
    look: 'arch',
    radius: GATE_RADIUS,
    gates: [
      { x: -224, z: 178 },
      { x: -221, z: 166 },
      { x: -214, z: 148 },
      { x: -232, z: 134 },
      { x: -248, z: 147 },
      { x: -260, z: 162 },
      { x: -276, z: 176 },
    ],
  },

  /*
   * The north face above the post is a continuous band steeper than Pip can walk (0.35-0.4), so the
   * ascent goes west along the foot, climbs the one walkable spur near x = 70, and comes back east
   * along the crest. That detour is the point of a lantern line: it shows you the way up.
   */
  'ridge-lantern-ascent': {
    look: 'lantern',
    radius: GATE_RADIUS,
    gates: [
      { x: 146, z: -140 },
      { x: 124, z: -142 },
      { x: 103, z: -147 },
      { x: 87, z: -163 },
      { x: 71, z: -179 },
      { x: 66, z: -199 },
      { x: 69, z: -220 },
      { x: 88, z: -228 },
      { x: 99, z: -209 },
      { x: 119, z: -202 },
      { x: 141, z: -200 },
      { x: 165, z: -200 },
    ],
  },

  // Down to the rope at the foot of the chimney, round its east side, then up onto the crest.
  'ridge-chimney-race': {
    look: 'arch',
    radius: GATE_RADIUS,
    gates: [
      { x: 239, z: -219 },
      { x: 252, z: -224 },
      { x: 264, z: -228 },
      { x: 270, z: -240 },
      { x: 273, z: -222 },
      { x: 274, z: -208 },
      { x: 272, z: -197 },
      { x: 286, z: -185 },
    ],
  },

  /*
   * A glide, not a run. It used to be seven ground gates down the shoulder, so "Fly" meant trudging
   * downhill. The east face of the summit falls faster than a glide sinks (about 1 in 4), so a bird
   * that jumps off the lip and holds Space stays a few metres up for twenty-odd seconds. These hoops
   * hang on that line: each one is a point the real player stepper passed through, gliding from the
   * post (sprint 8 u, jump, hold, steering 95 -> 80 -> 60 -> 40 degrees every 40 u, no flaps), at body
   * height. Flaps buy height to spare; walking underneath counts for nothing (`heights` is checked).
   */
  'peak-thermal-flight': {
    look: 'hoop',
    radius: GATE_RADIUS,
    gates: [
      { x: 369.4, z: -365.5 },
      { x: 389.4, z: -367.3 },
      { x: 409.2, z: -364.5 },
      { x: 429.0, z: -361.0 },
      { x: 446.7, z: -351.8 },
      { x: 464.1, z: -341.8 },
      { x: 477.5, z: -327.0 },
      { x: 490.4, z: -311.6 },
    ],
    heights: [87.2, 82.4, 77.6, 72.8, 68.0, 63.2, 58.4, 53.6],
  },
};

/** Fallback for a race nobody authored: five arches on a straight line, seeded off the post. */
function straightCourse(def: ActivityDef): RaceCourse {
  const heading = (Math.abs(def.pos.x * 613 + def.pos.z * 271) % 6283) / 1000;
  const gates: Vec2[] = [];
  for (let i = 1; i <= 5; i++) {
    gates.push({ x: def.pos.x + Math.sin(heading) * i * 20, z: def.pos.z + Math.cos(heading) * i * 20 });
  }
  return { gates, radius: GATE_RADIUS, look: 'arch' };
}

export function courseFor(def: ActivityDef): RaceCourse {
  return RACE_COURSES[def.id] ?? straightCourse(def);
}
