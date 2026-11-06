/**
 * The dressing rules, separated from the placement algorithm that consumes them.
 *
 * These are pure numbers: spacing, slope limits, per-zone prop mixes and scale ranges. They are the
 * part a designer edits; the algorithm next door is the part that must never change by accident.
 * `scatter.ts` had both, which is why every tuning change meant reading the placement loop to find
 * out which numbers were safe to touch.
 */

import type { ZoneId } from '../../core/contracts';
import { PEAK } from '../../data/zones';
import { LANDMARKS } from './landmarks';
import type { PropKind } from './props';

export interface Placement {
  kind: PropKind; variant: number; x: number; y: number; z: number; yaw: number; scale: number;
}

/** No two props closer than this, horizontally. */
export const MIN_SPACING = 2.2;
/** Nothing inside this band at the map edge. */
export const WORLD_MARGIN = 12;
/** Steepest surface a prop may stand on. */
export const MAX_SLOPE = 0.78;
/** Hard clearance floor around authored landmarks; buildings pad it out further. */
export const CLEARANCE = 6;
/** Whole-map instance budget (ART_BIBLE gate: 1400..2200). */
export const TOTAL_TARGET = 2150;
export const GRID = 6.2;
export const FENCE_PITCH = 2.6;

/** Extra clearance for landmarks whose footprint is bigger than a single prop. */
export const FOOTPRINT: Readonly<Record<string, number>> = {
  station: 18, hamlet: 26, boathouse: 11, springs: 15, mast: 12, chimney: 9, trucknow: 9,
};

/** Pinewind is a wood with a heart: dense in the middle, thinning to the zone edge. */
export const WOOD = { x: -230, z: 130, r: 190 };
export const CLEAR_ZONES = [
  ...LANDMARKS.map((l) => ({ x: l.x, z: l.z, r: Math.max(CLEARANCE, FOOTPRINT[l.id] ?? 0) })),
  { x: PEAK.x, z: PEAK.z, r: 8 },
];

/**
 * Art-directed counts.
 *
 * `reach` used to be 0 because the lake is ice and the surface rule excluded ice outright. That
 * was measured as a failure: the Frozen Reach frame came in at detail density 0.0010 against a
 * 0.005 gate, and p1 = 0.567 because a bare plane has nothing to cast a shadow onto. A frozen lake
 * is sparse, but it is not empty — wind-packed drifts, ice-bound boulders and dead reeds along the
 * shore are all real, and they are what give the lake a readable edge. So ice is now allowed a
 * restricted prop set instead of no props, and the exposed zones got a boost for the same reason.
 */
export const ZONE_TARGET: Readonly<Record<ZoneId, number>> = {
  hearth: 300, pinewind: 1150, reach: 300, kettles: 0, hamlet: 340, ridge: 820, peak: 260,
};
// Ridge and peak raised (critic round 59): the climb's slopes read as a white field with nothing in it
// for hundreds of units, and Pip lost contrast against them. Rocks and drifts give the snow edges.

/** Which silhouettes belong in which zone, before slope and elevation corrections. */
export const KINDS: Readonly<Record<ZoneId, Partial<Record<PropKind, number>>>> = {
  hearth: { pine: 0.18, bare: 0.06, drift: 0.24, brush: 0.18, rock: 0.08, stump: 0.04, fence: 0.12, signpost: 0.06 },
  pinewind: { pine: 0.62, bare: 0.07, drift: 0.12, brush: 0.12, rock: 0.03, stump: 0.04 },
  // Nothing that grows: only what can sit on or beside ice. No pines, fence, signpost or stump.
  reach: { drift: 0.58, rock: 0.30, brush: 0.12 },
  kettles: { pine: 0.1, bare: 0.12, drift: 0.14, brush: 0.26, rock: 0.34, stump: 0.04 },
  hamlet: { pine: 0.14, bare: 0.08, drift: 0.16, brush: 0.2, rock: 0.06, stump: 0.05, fence: 0.16, signpost: 0.05 },
  ridge: { pine: 0.1, bare: 0.2, drift: 0.26, brush: 0.1, rock: 0.34 },
  peak: { bare: 0.08, drift: 0.24, rock: 0.68 },
};

/** Candidate acceptance before kind selection; snowDensity sets the weather, this sets the cover. */
export const DENSITY: Readonly<Record<ZoneId, number>> = { hearth: 0.6, pinewind: 1, reach: 0.45, kettles: 0.5, hamlet: 0.65, ridge: 1, peak: 0.8 };

export const SCALE: Readonly<Record<PropKind, readonly [number, number]>> = {
  pine: [0.9, 1.3], bare: [0.8, 1.25], rock: [0.7, 1.6], drift: [0.8, 1.8], brush: [0.7, 1.3],
  fence: [1, 1], signpost: [1, 1], lantern: [1, 1], stump: [0.8, 1.15],
};
