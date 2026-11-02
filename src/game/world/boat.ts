/**
 * Skiff's boat, frozen into the Frozen Reach where the ice caught it.
 *
 * It used to be the boathouse: a little gabled hut on the ice, so "the boat iced in" and "the flour
 * on his boat" pointed at a house (critic 3). Now it is a boat, and it has to say so in a dozen
 * pixels from across the lake: a red hull with a pale sheer stripe, rising to a pointed bow; a
 * wheelhouse aft with a lit window and a stovepipe; a mast with the sail furled on its boom and
 * stays to bow and stern; the hold hatch on the foredeck with a flour sack showing. The ice has
 * ridged up round the hull where it froze, plates pushed up on edge, heaped highest at the bow.
 * The sled from "up in the rafters" is lashed on the wheelhouse roof.
 *
 * Authored about the landmark anchor, bow toward local +z. The hull is sunk to below the ice line.
 */

import { GEO, GeoBuilder, propMatrix, type Triple } from './geoBuilder';

/** Stations along the hull, stern to bow: z, half-beam at the deck, and the sheer (deck height). */
const HULL: readonly (readonly [number, number, number])[] = [
  [-4.2, 1.35, 1.25], [-2.6, 1.6, 1.15], [-0.6, 1.68, 1.12], [1.4, 1.55, 1.18], [2.9, 1.15, 1.32], [4.0, 0.55, 1.5], [4.7, 0, 1.68],
];
/** The ice line on the hull, and how far in the hull tucks below the deck edge there. */
const ICE = -0.15;
const TUCK = 0.78;

function hull(b: GeoBuilder): void {
  for (let i = 0; i < HULL.length - 1; i++) {
    const [z0, w0, s0] = HULL[i];
    const [z1, w1, s1] = HULL[i + 1];
    for (const side of [-1, 1]) {
      const out: Triple = [side * 4, 0.6, (z0 + z1) / 2];
      // Topsides in red, a pale stripe under the gunwale, then the gunwale itself.
      b.quad([side * w0 * TUCK, ICE, z0], [side * w1 * TUCK, ICE, z1], [side * w1, s1 - 0.3, z1], [side * w0, s0 - 0.3, z0], 'BRICK', out);
      b.quad([side * w0, s0 - 0.3, z0], [side * w1, s1 - 0.3, z1], [side * w1, s1 - 0.1, z1], [side * w0, s0 - 0.1, z0], 'SNOW_LT', out);
      b.quad([side * w0, s0 - 0.1, z0], [side * w1, s1 - 0.1, z1], [side * w1, s1 + 0.08, z1], [side * w0, s0 + 0.08, z0], 'WOOD_DK', out);
    }
    // The deck under its snow, a little below the gunwale.
    b.quad([-w0, s0 - 0.05, z0], [w0, s0 - 0.05, z0], [w1, s1 - 0.05, z1], [-w1, s1 - 0.05, z1], 'SNOW_LT', [0, 9, (z0 + z1) / 2]);
  }
  const [zs, ws, ss] = HULL[0];
  b.quad([-ws * TUCK, ICE, zs], [ws * TUCK, ICE, zs], [ws, ss + 0.08, zs], [-ws, ss + 0.08, zs], 'BRICK', [0, 0.6, zs - 4]);
  b.box(0, ss - 0.3, zs - 0.03, ws * 1.9, 0.2, 0.06, 'SNOW_LT');
}

function wheelhouse(b: GeoBuilder): void {
  const z = -2.2, y = 1.1;
  b.box(0, y, z, 2.1, 1.55, 1.9, 'WOOD_LT');
  b.box(0, y + 1.55, z, 2.4, 0.12, 2.2, 'WOOD_DK', 'SNOW_LT');
  b.box(0, y + 1.67, z, 2.3, 0.14, 2.1, 'SNOW_HI');
  // Forward windows, one of them lit: Skiff keeps a lamp in there.
  for (const x of [-0.5, 0.5]) b.box(x, y + 0.8, z + 0.96, 0.62, 0.48, 0.04, 'WOOD_DK');
  b.glow();
  b.add(GEO.quad, propMatrix(0.5, y + 1.04, z + 0.99, 0.5, 0.38, 1), 'LANTERN');
  b.glow(false);
  b.add(GEO.quad, propMatrix(-0.5, y + 1.04, z + 0.99, 0.5, 0.38, 1), 'WATER_DK');
  b.cyl(0.7, y + 1.6, z - 0.5, 0.09, 0.8, 'ROCK_DK');
  // The sled from the rafters, lashed on the roof.
  for (const sx of [-0.3, 0.3]) b.strut([sx, y + 1.88, z - 0.9], [sx, y + 1.88, z + 0.7], 0.04, 'WOOD_DK');
  b.box(0, y + 1.92, z - 0.1, 0.8, 0.07, 1.5, 'WOOD_MID', 'SNOW_LT');
}

function rig(b: GeoBuilder): void {
  const mz = 0.9, top = 6.4;
  b.cyl(0, 1.0, mz, 0.11, top - 1.0, 'WOOD_MID');
  b.box(0, top - 0.05, mz, 0.24, 0.12, 0.24, 'WOOD_DK', 'SNOW_HI');
  // The boom aft over the wheelhouse, the sail furled along it and snowed on.
  b.strut([0, 2.3, mz], [0, 3.35, -3.6], 0.06, 'WOOD_DK');
  b.strut([0, 2.5, mz - 0.2], [0, 3.55, -3.3], 0.2, 'SNOW_MID');
  b.strut([0, 2.62, mz - 0.2], [0, 3.67, -3.3], 0.12, 'SNOW_HI');
  // Stays to the bow and the stern, and the shrouds to either gunwale.
  b.strut([0, top, mz], [0, 1.7, 4.65], 0.025, 'ROCK_MID');
  b.strut([0, top, mz], [0, 1.4, -4.15], 0.025, 'ROCK_MID');
  for (const side of [-1, 1]) b.strut([0, top - 0.6, mz], [side * 1.58, 1.2, mz - 0.2], 0.022, 'ROCK_MID');
}

function hold(b: GeoBuilder): void {
  b.box(0, 1.2, 2.4, 1.3, 0.22, 1.1, 'WOOD_MID', 'SNOW_LT');
  // The hatch cover pushed half back, and a flour sack showing in the gap.
  b.add(GEO.box, propMatrix(0.25, 1.48, 2.15, 0.9, 0.08, 0.95, 0.12), 'WOOD_DK', 'SNOW_LT');
  b.add(GEO.ico, propMatrix(-0.25, 1.48, 2.75, 0.34, 0.24, 0.3, 0.4), 'SUN_HI', 'SNOW_HI', 0.7);
  b.add(GEO.ico, propMatrix(0.9, 1.42, -0.3, 0.32, 0.26, 0.42, 1.1), 'SUN_HI', 'SNOW_HI', 0.7);
}

/** Ice heaved up where the lake froze round the hull: plates on edge and broken chunks. */
function pressureRidge(b: GeoBuilder): void {
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const bow = Math.max(0, Math.cos(a));
    const rx = Math.sin(a) * 2.25, rz = Math.cos(a) * 5.3;
    const tall = 0.35 + 0.45 * bow + 0.2 * Math.abs(Math.sin(i * 1.7));
    const lean = Math.atan2(rx, rz * 0.4);
    b.add(GEO.box, propMatrix(rx, tall * 0.3 - 0.1, rz, 1.0 + 0.3 * Math.sin(i), tall, 0.14, lean, 0.5 * Math.sin(i * 2.3), 0.4),
      i % 3 ? 'ICE_HI' : 'ICE_MID', 'SNOW_HI');
    if (i % 2) b.add(GEO.tetra, propMatrix(rx * 1.15, 0.1, rz * 1.06, 0.45, 0.3 + 0.3 * bow, 0.4, a), 'ICE_MID', 'SNOW_LT', 0.5);
  }
}

export function icedBoat(b: GeoBuilder): void {
  hull(b);
  wheelhouse(b);
  rig(b);
  hold(b);
  pressureRidge(b);
}
