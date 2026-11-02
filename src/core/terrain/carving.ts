/**
 * What is cut into the mountain after it is baked, and what is built across the cut.
 *
 * Tuck keeps a rope bridge on Windscar Ridge, and for two rounds the world had no bridge and nothing
 * for one to cross: he stood on bare snow talking about planks. The ridge now has a gully, a narrow
 * notch cut down the south face of the crest and across the shelf, and the way up crosses it on his
 * bridge. Both are terrain, so they live beside the heightfield rather than in the scenery:
 *
 *  - The GULLY is lowered into the baked grid itself (heightfield.ts), on one grid column, so the
 *    drawn ground and the ground Pip stands on stay the same surface. It is a V a little over two
 *    cells wide and 14 u deep at the bridge: walls too steep to walk, a floor that runs out to the
 *    south as a walkable ramp, so a bird that drops in can walk out.
 *  - The BRIDGE deck is an overlay on `heightAt`: across the deck the ground is the planks. It is
 *    wider than the planks so the slope Pip feels on it is the deck's own, and its centre line lies
 *    midway between two grid rows, so no terrain vertex sits under it (the mesh takes its heights and
 *    normals from the ground without the deck; see `groundOnly` in heightfield.ts).
 */

import { smoothstep } from '../contracts';

/** The gully's centre line, x; snapped to the nearest grid column when it is cut. */
export const GULLY_X = 163.5;
/** Its head below the crest and its foot out on the shelf, as -z (south is more negative). */
const GULLY_HEAD = [204, 214] as const;
const GULLY_FOOT = [246, 268] as const;
export const GULLY_DEPTH = 14;
/** Full depth inside this half-width, nothing past the outer one. */
const GULLY_FLOOR = 1.5;
export const GULLY_RIM = 6;

/** How far down (x, z) is cut, for a gully whose centre line is `cx`. */
export function gullyDepth(x: number, z: number, cx = GULLY_X): number {
  const d = Math.abs(x - cx);
  if (d >= GULLY_RIM) return 0;
  const along = smoothstep(GULLY_HEAD[0], GULLY_HEAD[1], -z) * (1 - smoothstep(GULLY_FOOT[0], GULLY_FOOT[1], -z));
  return GULLY_DEPTH * along * (1 - smoothstep(GULLY_FLOOR, GULLY_RIM, d));
}

/**
 * A copy of the baked grid with the gully cut into it. The centre line is snapped to the nearest
 * grid column, so every row has a vertex on the floor and the V is the same all the way down.
 */
export function carveGrid(size: number, res: number, heights: Float32Array): Float32Array {
  const cell = size / (res - 1);
  const half = size / 2;
  const cx = -half + Math.round((GULLY_X + half) / cell) * cell;
  const out = heights.slice();
  for (let iz = 0; iz < res; iz++) {
    for (let ix = 0; ix < res; ix++) {
      const cut = gullyDepth(-half + ix * cell, -half + iz * cell, cx);
      if (cut > 0) out[iz * res + ix] -= cut;
    }
  }
  return out;
}

/** The gully as a line, for clearing scenery off it and laying the frozen stream along its floor. */
export const GULLY_LINE: readonly (readonly [number, number])[] = [[GULLY_X, -GULLY_HEAD[0]], [GULLY_X, -GULLY_FOOT[1]]];

export interface Deck {
  ax: number; az: number;
  bx: number; bz: number;
  /** Half-width of the walkable overlay; the planks themselves are narrower. */
  half: number;
  /** How far the middle hangs below a straight line between the ends. */
  sag: number;
}

/**
 * Tuck's bridge, west to east along the way up (trail.ts runs along z = -231 here). z = -230.53 is
 * midway between grid rows -233.21 and -227.85 (cell 5.36), so the overlay touches no terrain vertex.
 */
export const TUCK_BRIDGE: Deck = { ax: 156, az: -230.53, bx: 171, bz: -230.53, half: 1.8, sag: 0.55 };

export const DECKS: readonly Deck[] = [TUCK_BRIDGE];

/** Height of the deck at fraction t from a to b, given the ground at its two ends. */
export function deckY(deck: Deck, t: number, ha: number, hb: number): number {
  return ha + (hb - ha) * t - deck.sag * Math.sin(Math.PI * t);
}

/** `heightAt` with the decks laid over it: on a deck, whichever is higher of deck and ground. */
export function withDecks(ground: (x: number, z: number) => number, decks: readonly Deck[]): (x: number, z: number) => number {
  const ends = decks.map((d) => ({
    d, ha: ground(d.ax, d.az), hb: ground(d.bx, d.bz),
    len: Math.hypot(d.bx - d.ax, d.bz - d.az),
  }));
  return (x, z) => {
    let h = ground(x, z);
    for (const e of ends) {
      const ux = (e.d.bx - e.d.ax) / e.len, uz = (e.d.bz - e.d.az) / e.len;
      const px = x - e.d.ax, pz = z - e.d.az;
      const t = (px * ux + pz * uz) / e.len;
      if (t < 0 || t > 1 || Math.abs(px * uz - pz * ux) > e.d.half) continue;
      h = Math.max(h, deckY(e.d, t, e.ha, e.hb));
    }
    return h;
  };
}
