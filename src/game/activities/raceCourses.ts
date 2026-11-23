/**
 * Authored race courses: the gates each race runs through, in order, ending at the finish.
 *
 * The race used to be a seeded bearing and a 110 u straight line with nothing drawn on it, so
 * "Chimney Scramble ... to the top" ran flat west and nobody could tell where the course went.
 * Every course here was routed against the real heightfield and the real tree colliders, and each
 * leg was walked by the real player stepper (see the report that came with this file):
 *
 *   - no leg needs a slope steeper than the 0.35 walk limit in step.ts, except the chimney scramble's
 *     three walls, each of which goes on one bar of breath;
 *   - every gate stands on open ground, clear of trunks and rocks;
 *   - the course reads like its name: the deer trail winds through Pinewind, the chimney scramble
 *     goes up Nettle Chimney ledge by ledge to its top, the lantern ascent
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

  // Down the west foot of the chimney to the rope on its tall south-west side, then up it: a gate on
  // each ledge and the last on top. Every wall goes on one bar of breath without a feather.
  // The post, the first gate and the second stand in a line, down off the bank onto the flat. Gate 1 stood
  // 3 u up the bank north-east of the post, so the run turned straight back past the start: critic round 111
  // read "Gate 2 of 6, behind you, to your left" after gate 1 and gave up on the course.
  'ridge-chimney-race': {
    look: 'arch',
    radius: GATE_RADIUS,
    gates: [
      { x: 218, z: -238 },
      { x: 226, z: -244 },
      { x: 238, z: -252 },
      { x: 245.7, z: -244.3 },
      { x: 254.2, z: -235.8 },
      { x: 266, z: -228 },
    ],
  },

  /*
   * A glide, not a run. It used to be seven ground gates down the shoulder, so "Fly" meant trudging
   * downhill. The east face of the summit falls faster than a glide sinks (about 1 in 4), so a bird
   * that jumps off the lip and holds Space stays a few metres up for twenty-odd seconds. These hoops
   * hang on that line: each one is a point the real player stepper passed through, gliding from the
   * post (sprint 8 u, jump, hold, steering 95 -> 80 -> 60 -> 40 degrees every 40 u, no flaps), at body
   * height. Flaps buy height to spare; walking underneath counts for nothing (`heights` is checked).
   *
   * Then every hoop after the first was pushed 6 u off that line, left and right in turn: critic round
   * 25 flew 8 of 8 holding forward. Now a glide that steers A / D for each threads them all and one held
   * straight misses five. Weaving costs height, so the last hoop wants a flap or two on the way; the
   * heights sit between a glide that never flaps and one that flaps whenever it is under 2.5 u up.
   */
  'peak-thermal-flight': {
    look: 'hoop',
    radius: GATE_RADIUS,
    gates: [
      { x: 369.4, z: -365.5 },
      { x: 389.2, z: -361.3 },
      { x: 410.1, z: -370.4 },
      { x: 427.1, z: -355.3 },
      { x: 449.6, z: -357.1 },
      { x: 460.3, z: -337.1 },
      { x: 482.0, z: -330.9 },
      { x: 485.8, z: -307.7 },
    ],
    heights: [87.9, 83.0, 77.6, 72.0, 66.6, 61.1, 55.7, 53.6],
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
