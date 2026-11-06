/**
 * What each photo viewpoint is a photo OF.
 *
 * The subject used to be a seeded point on the snow near the viewpoint, which meant the player was
 * asked to centre an invisible spot of ground — and for the aurora, a spot of ground instead of the
 * sky. Each viewpoint now names a real, visible thing:
 *
 *   ground  a world position (x, z) plus a height above the terrain there. Positions are read off the
 *           built world: the steam rises off a SPRING_POOLS basin, the market lamp is the hamlet
 *           bell-post lantern, and the ice ridge is one of water.ts's pressure ridges. `piece` puts
 *           the subject there itself when the world has nothing worth the shot: the Hoarfrost Glade
 *           was a generic pine filling the whole frame, so a roe deer now stands in the clearing.
 *   aurora  the curtains render/aurora.ts draws, read from the same table (pixelConfig.ts AURORA).
 *           "Centred" means the middle of the frame is on a curtain. It used to be one fixed direction
 *           (due north, 25 degrees up) that sat in the gap between two curtains, so the ribbons could
 *           fill the frame while the panel still said "Turn toward it".
 *
 * Kept beside photo.ts rather than in data/activities.ts so the activity table stays a list of places
 * and this stays a list of things to look at. A viewpoint missing here falls back to the old seeded
 * subject, so a new photo activity is never unplayable, only unauthored.
 */

import { angleDelta } from '../../core/contracts';
import type { TerrainSampler } from '../../core/contracts';
import { AURORA } from '../render/pixelConfig';
import type { PieceLook, PlacedMarker } from './markerLooks';

export type PhotoSubject =
  | { kind: 'ground'; x: number; z: number; lift: number; what: string; piece?: { look: PieceLook; yaw: number; size?: number } }
  | { kind: 'aurora'; what: string };

export const PHOTO_SUBJECTS: Readonly<Record<string, PhotoSubject>> = {
  // A roe deer at the north edge of the glade, 10 u west of the viewpoint, side-on to it. Seen from the
  // south it stood in front of a pine trunk and read as a dead bush; from the east there is open snow
  // behind it for sixty metres. Aimed at its shoulder.
  'pinewind-glade-photo': {
    kind: 'ground', x: -229, z: 139, lift: 1.4, what: 'deer', piece: { look: 'deer', yaw: 0, size: 1.25 },
  },
  // Pressure ridge 12 on the Frozen Reach (water.ts), ~13 u out on the ice; low, so aimed just above it.
  'reach-ice-photo': { kind: 'ground', x: 67.9, z: 350.6, lift: 0.5, what: 'pressure ridge' },
  // The steam column over the south-east Kettle basin (-24, 78), 8 u in front of the viewpoint. Aimed
  // where the column leans downwind (steam.ts drift), just over the water, so the print has the pool's
  // rim under the column rising: aimed at the basin's middle the frame was "Centred" on sky beside the
  // plume (critic round 47), and 3.4 u up it was all puff, which at dusk lets the aurora through, and
  // critic round 58's "The steam, caught on camera" printed only green sky.
  'kettles-steam-photo': { kind: 'ground', x: -23.4, z: 78, lift: 1.6, what: 'steam' },
  // The lamp on the arm of the hamlet's bell post, beside the bell (landmarks.ts LAMP_ARM), 16 u away.
  // It used to aim at the bell itself, with the words "market lamp", and critics rounds 21 and 45 were
  // told to centre a lamp while the arrow sat on a bell.
  'hamlet-market-photo': { kind: 'ground', x: 249.05, z: 120, lift: 1.6, what: 'market lamp beside the bell' },
  'peak-aurora-photo': { kind: 'aurora', what: 'aurora' },
};

export function photoSubjectFor(id: string): PhotoSubject | null {
  return PHOTO_SUBJECTS[id] ?? null;
}

const NORTH = Math.PI;

/**
 * Is a view direction on one of the aurora's curtains? Yaw follows forward = (sin yaw, cos yaw) and
 * pitch is radians above the horizon, exactly as aurora.ts builds them; the inner 85% of each curtain's
 * width and its lower 90% count (the hem is the bright part, the top fades out). Faint curtains count
 * too: any curtain on screen is the aurora.
 */
export function onAurora(yaw: number, pitch: number): boolean {
  return AURORA.curtains.some((c) => {
    const across = Math.abs(angleDelta(yaw, NORTH + c.yaw));
    return across <= c.half * 0.85 && pitch >= c.base - 0.03 && pitch <= c.base + c.height * 0.9;
  });
}

/** The direction to aim for the aurora's brightest part: the middle of the main curtain's hem. */
export function auroraHeart(): { yaw: number; pitch: number } {
  const main = AURORA.curtains[0];
  return { yaw: NORTH + main.yaw, pitch: main.base + main.height * 0.3 };
}

/** Subjects the activity puts in the world itself, as kept pieces stood up at boot. */
export function photoSubjectMarkers(terrain: TerrainSampler): PlacedMarker[] {
  const out: PlacedMarker[] = [];
  for (const [id, s] of Object.entries(PHOTO_SUBJECTS)) {
    if (s.kind !== 'ground' || !s.piece) continue;
    out.push({
      shape: 'lump', look: s.piece.look, keep: `photo:${id}`,
      x: s.x, y: terrain.heightAt(s.x, s.z), z: s.z, yaw: s.piece.yaw, size: s.piece.size ?? 1,
    });
  }
  return out;
}
