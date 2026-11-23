/**
 * What fishing draws: the float and its line, the rings and splash on the water, and the catch.
 *
 * Kept apart from fishing.ts, which decides when things happen; this only turns "where the float is,
 * how far it is pulled under, how long since the last change" into markers.
 */

import type { FishDef, Vec3 } from '../../core/contracts';
import { PALETTE } from '../../core/palette';
import type { PlacedMarker } from './markerLooks';

export interface FloatScene {
  /** Where the float rests on the water (fishSpots.floatPoint). */
  float: Vec3;
  /** Where Pip stands. */
  stand: Vec3;
  /** Metres the float is pulled down right now (negative is under). */
  dip: number;
  /** Seconds since the float last changed state: cast, bite or catch. */
  age: number;
  /** Ripples spread (the float landed, was taken, or the fish broke the water). */
  ripple: boolean;
  /** Spray thrown up (a bite, or the fish leaving the water). */
  splash: boolean;
  /** The float is hidden while the catch is held up. */
  showFloat: boolean;
  clock: number;
}

/** The rod tip: above Pip's head, a little toward the water. */
export function rodTip(stand: Vec3, float: Vec3): Vec3 {
  const d = Math.hypot(float.x - stand.x, float.z - stand.z) || 1;
  return { x: stand.x + ((float.x - stand.x) / d) * 0.5, y: stand.y + 1.5, z: stand.z + ((float.z - stand.z) / d) * 0.5 };
}

export function floatMarkers(s: FloatScene): PlacedMarker[] {
  const out: PlacedMarker[] = [];
  const f = s.float;
  if (s.showFloat) {
    // Half under the surface at rest (the float mesh stands 0.3 above its base); gone under at a bite.
    const y = f.y - 0.35 + s.dip;
    // Half again as big as it was: critic round 78 saw the float as a small dot past the stool.
    out.push({ shape: 'float', x: f.x, y, z: f.z, size: 1.8, color: PALETTE.SNOW_HI });
    out.push({ shape: 'float', x: f.x, y: y + 0.33, z: f.z, size: 1.12, color: PALETTE.PIP_SCARF });
    const tip = rodTip(s.stand, f);
    for (let k = 1; k <= 5; k++) {
      const t = k / 6;
      out.push({
        shape: 'float', look: 'dot', size: 0.45, strength: 0.5,
        x: tip.x + (f.x - tip.x) * t, y: tip.y + (y + 0.6 - tip.y) * t, z: tip.z + (f.z - tip.z) * t,
      });
    }
  }
  if (s.ripple && s.age < 1.2) {
    out.push({
      shape: 'ring', look: 'halo', x: f.x, y: f.y - 0.1, z: f.z,
      size: 0.3 + s.age * 0.9, strength: 1 - s.age / 1.2, color: PALETTE.WATER_FOAM,
    });
  }
  if (s.splash) {
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + s.clock * 3;
      const up = (s.age * 3 + k * 0.3) % 1;
      out.push({
        shape: 'lump', look: 'puff', x: f.x + Math.sin(a) * 0.3, y: f.y + up * 0.5, z: f.z + Math.cos(a) * 0.3,
        size: 0.35 * (1 - up) + 0.1, strength: 1 - up, yaw: a,
      });
    }
  }
  return out;
}

/** The catch: out of the water in a short arc, then hanging on the line in front of Pip, wriggling. */
export function catchMarkers(fish: FishDef, float: Vec3, stand: Vec3, age: number): PlacedMarker[] {
  const tip = rodTip(stand, float);
  const k = Math.min(1, age / 0.6);
  const hang = { x: tip.x + (float.x - tip.x) * 0.35, y: tip.y - 0.55, z: tip.z + (float.z - tip.z) * 0.35 };
  const x = float.x + (hang.x - float.x) * k;
  const z = float.z + (hang.z - float.z) * k;
  const y = float.y + (hang.y - float.y) * k + Math.sin(k * Math.PI) * 1.2;
  const wriggle = Math.sin(age * (k < 1 ? 20 : 9)) * 0.5;
  // Flank turned across the line to the water, toward the camera standing off to the side.
  const yaw = Math.atan2(tip.x - float.x, tip.z - float.z) + wriggle;
  // Leaping nose-up out of the hole, then held up side-on and level, the way a catch is shown off.
  const pitch = k < 1 ? -1.1 * (1 - k) : -0.2;
  const back = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
  const s = 1.9;
  // Just behind the nose of the fish shape (activityMarkers.ts), which ends 0.36 s forward.
  const eye = 0.24 * s;
  // Not every catch is a fish: Hollis's mitten hangs off the hook by its cuff, dripping.
  if (fish.id === 'mitten') {
    return [
      { shape: 'float', look: 'mitten', x, y: y - 0.25, z, yaw: yaw + Math.PI / 2, tilt: wriggle * 0.3, size: 1, color: fish.body },
      ...(k >= 1 ? [0, 1].map((n): PlacedMarker => {
        const drip = (age * 1.4 + n * 0.5) % 1;
        return { shape: 'float', look: 'dot', x, y: y - 0.75 - drip * 0.8, z, size: 0.5, strength: 1 - drip, color: PALETTE.WATER_FOAM };
      }) : []),
    ];
  }
  return [
    { shape: 'float', look: 'fish', x, y, z, yaw, pitch, size: s, color: fish.body },
    // An eye on each flank, just proud of the body, so whichever side faces the camera has one.
    ...[-1, 1].map((side): PlacedMarker => ({
      shape: 'float', look: 'dot', size: 0.5, color: PALETTE.PIP_GLASS,
      x: x - back.x * eye + Math.cos(yaw) * side * 0.1, y: y - back.y * eye + 0.06 * s, z: z - back.z * eye - Math.sin(yaw) * side * 0.1,
    })),
    {
      shape: 'float', look: 'fin', x: x + back.x * 0.55 * s, y: y + back.y * 0.55 * s, z: z + back.z * 0.55 * s,
      yaw, pitch, size: s, color: fish.accent,
    },
  ];
}
