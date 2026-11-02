/**
 * The two trees the dialogue names, and Bram's woodstore.
 *
 * "Bram, who keeps the woodstore by the big pine" and "under the roots of the split pine, creek side"
 * were only words: the big pine was an ordinary scatter pine and the split pine did not exist. Each
 * is built here as one landmark silhouette that cannot be mistaken for scatter: the big pine stands
 * two and a half times the height of the wood and reads from the cabin door; the split pine is a
 * broad old trunk forked into a V, with its roots arched over the spring that starts the creek.
 *
 * Authored in local space about the trunk base, like the buildings in landmarks.ts.
 */

import { GEO, GeoBuilder, propMatrix } from './geoBuilder';

/** A tier of branches: dark cone, a snow shelf on its rim, and a heavier cap on the top ones. */
function tier(b: GeoBuilder, x: number, y: number, z: number, r: number, h: number, dark: boolean, snowy: boolean): void {
  b.cone(x, y, z, r, h, dark ? 'PINE_DK' : 'PINE_MID', 6);
  b.cone(x, y - 0.12, z, r * 1.06, 0.4, 'SNOW_LT', 6);
  if (snowy) b.cone(x, y + h * 0.55, z, r * 0.52, h * 0.3, 'SNOW_HI', 6);
}

/** Total height of the big pine, for the occluder and the camera. */
export const BIG_PINE_HEIGHT = 27;

/**
 * The big pine: a flared trunk, seven broad tiers with heavy snow shelves, a crown that leans a
 * little, and two bare lower limbs where the wood has been cut for the store. Height ~27 u against
 * the wood's 9-13, so it is the one tree you can see from the cabin and from the far side of the
 * hollow.
 */
export function bigPine(b: GeoBuilder): void {
  b.add(GEO.cone6, propMatrix(0, 0.9, 0, 1.7, 2.2, 1.7), 'BARK');
  b.cyl(0, -0.2, 0, 0.8, 16, 'BARK');
  for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + 0.4;
    b.strut([Math.cos(a) * 0.8, 0.8, Math.sin(a) * 0.8], [Math.cos(a) * 2.3, -0.1, Math.sin(a) * 2.3], 0.28, 'BARK');
  }
  // Two sawn-off lower limbs: the woodstore's stock had to come from somewhere.
  b.strut([0.5, 4.2, 0.2], [2.6, 4.9, 0.9], 0.22, 'BARK');
  b.add(GEO.stump, propMatrix(2.6, 4.9, 0.9, 0.24, 0.12, 0.24, 0, 0, 1.2), 'WOOD_LT');
  b.strut([-0.5, 5.0, -0.3], [-2.2, 5.9, -1.4], 0.2, 'BARK');
  const tiers = 7;
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1);
    const y = 5.5 + f * 17;
    const r = 6.2 - f * 4.6;
    // The crown drifts east as it climbs: a tree this old has leaned into the wind for a century.
    const lean = f * f * 1.1;
    tier(b, lean + 0.3 * Math.sin(i * 2.3), y, 0.25 * Math.cos(i * 1.9), r, 5.6 - f * 1.8, i % 2 === 0, i >= tiers - 2);
  }
  b.cone(1.1, 23.4, 0, 0.9, 3.6, 'PINE_DK', 6);
  b.cone(1.1, 25.2, 0, 0.5, 1.8, 'SNOW_HI', 6);
}

/** Height of the split pine's taller crown. */
export const SPLIT_PINE_HEIGHT = 17;

/** One leaning trunk of the split pine and its crown, `side` = -1 or 1 across the split. */
function splitCrown(b: GeoBuilder, side: number, len: number, tiers: number): void {
  const lean = side * 0.36;
  const top: [number, number, number] = [Math.sin(lean) * len + side * 0.4, 3 + Math.cos(lean) * len, side * 0.3];
  // The trunk stops inside its own crown; only the tiers show above it.
  const end: [number, number, number] = [side * 0.35 + (top[0] - side * 0.35) * 0.8, 2.6 + (top[1] - 2.6) * 0.8, top[2] * 0.8];
  b.strut([side * 0.35, 2.6, 0], end, 0.48, 'BARK');
  for (let i = 0; i < tiers; i++) {
    const f = (i + 1) / (tiers + 1);
    const x = side * 0.35 + (top[0] - side * 0.35) * (0.35 + 0.65 * f);
    const y = 2.6 + (top[1] - 2.6) * (0.35 + 0.65 * f) - 1.6;
    tier(b, x, y, top[2] * f, 3.4 - f * 2.2, 3.6 - f * 1.2, i % 2 === 1, i === tiers - 1);
  }
}

/**
 * The split pine: a broad trunk to the fork, a pale lightning scar where it parted, two crowns
 * leaning apart into a V, and roots arched high enough that a mitten could lodge under them. The
 * creek rises under the roots on the -x side (namedPlaces.ts lays the water there).
 */
export function splitPine(b: GeoBuilder): void {
  b.add(GEO.cone6, propMatrix(0, 0.7, 0, 1.6, 1.8, 1.4), 'BARK');
  b.cyl(0, -0.2, 0, 0.95, 3.2, 'BARK');
  // The scar: raw pale wood in the crotch of the fork, charred at its edges.
  b.box(0, 2.3, 0, 0.5, 1.6, 1.0, 'WOOD_LT');
  b.box(0, 3.0, 0, 0.7, 0.3, 1.05, 'WOOD_DK');
  splitCrown(b, -1, 12.5, 4);
  splitCrown(b, 1, 10, 3);
  // Roots arched over the spring hollow on the west side, and gripping the bank on the others.
  b.strut([-0.6, 1.2, 0.5], [-2.1, 1.0, 0.9], 0.24, 'BARK');
  b.strut([-2.1, 1.0, 0.9], [-2.9, -0.1, 1.5], 0.2, 'BARK');
  b.strut([-0.6, 1.1, -0.5], [-2.0, 0.8, -1.3], 0.22, 'BARK');
  b.strut([-2.0, 0.8, -1.3], [-2.8, -0.1, -1.8], 0.18, 'BARK');
  b.strut([0.7, 1.0, 0.3], [2.4, -0.1, 0.8], 0.22, 'BARK');
  b.strut([0.2, 1.0, -0.7], [0.6, -0.1, -2.4], 0.2, 'BARK');
  b.add(GEO.ico, propMatrix(-2.7, 0.15, 0.1, 0.55, 0.32, 0.5), 'ROCK_DK', 'SNOW_LT', 0.5);
}

/**
 * Bram's woodstore: an open-fronted lean-to under the big pine, full of split rounds stacked end-on
 * so the front reads as a wall of pale log ends. Faces local +z.
 */
export function woodstore(b: GeoBuilder): void {
  const w = 4.4, d = 2.2;
  b.box(0, -0.3, -d / 2, w, 2.7, 0.18, 'WOOD_MID');
  for (const sx of [-1, 1]) b.box((sx * w) / 2, -0.3, 0, 0.18, 2.7, d, 'WOOD_MID');
  for (const sx of [-1, 1]) b.cyl((sx * w) / 2, -0.2, d / 2, 0.11, 3.2, 'WOOD_DK');
  // Lean-to roof, high at the front, with its own snow slab.
  b.add(GEO.box, propMatrix(0, 2.85, 0.1, w + 0.6, 0.16, d + 0.9, 0, -0.2), 'WOOD_DK', 'SNOW_LT', 0.5);
  b.add(GEO.box, propMatrix(0, 3.02, 0.1, w + 0.5, 0.18, d + 0.8, 0, -0.2), 'SNOW_LT', 'SNOW_HI', 0.5);
  // The stock: three courses of rounds, end grain out.
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 7; i++) {
      const x = -w / 2 + 0.45 + i * 0.58 + (row % 2) * 0.29;
      if (x > w / 2 - 0.3) continue;
      b.add(GEO.stump, propMatrix(x, 0.25 + row * 0.52, 0, 0.26, d * 0.9, 0.26, 0, Math.PI / 2), 'WOOD_LT', 'WOOD_LT');
    }
  }
  b.box(1.6, -0.1, d / 2 + 0.7, 0.7, 0.55, 0.7, 'BARK', 'SNOW_LT');
}
