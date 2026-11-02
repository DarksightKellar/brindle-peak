/**
 * Tuck's bridge: a rope-and-plank footbridge over the gully on Windscar Ridge (core/terrain/carving.ts).
 *
 * Tuck talks about the planks, the fraying rope and keeping the bridge, and for two rounds he stood on
 * bare snow. The way up now crosses the gully here, so every climber walks it. Read from the trail
 * it has to say "rope bridge" in a few pixels: two anchor posts at each end, a sagging run of planks
 * with one missing, two hand ropes hung from the posts with drop lines to the plank ends, and on the
 * north hand rope near Tuck's end a pale frayed stretch with loose strands, the bit he points at.
 * Beside the west posts lies the old rope he coils and recoils while he waits for a good one.
 *
 * The planks are drawn where the deck overlay puts Pip's feet (`deckY`), from the ground without the
 * deck, so what you walk on and what you see are the same line. The hand ropes are the colliders:
 * nobody walks off the side, and the posts flare the entrance so you are funnelled on, not snagged.
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import { deckY, TUCK_BRIDGE as B } from '../../core/terrain/carving';
import { groundOnly } from '../../core/terrain/heightfield';
import { GEO, GeoBuilder, propMatrix, type Triple } from './geoBuilder';

const PLANK_PITCH = 0.42;
/** Hand ropes run this far either side of the centre line; the planks are a little narrower. */
const RAIL = 1.02;
const POST_OUT = 1.35;
const ROPE_SEGMENTS = 14;
/** Which hand-rope segment is frayed: the third out from Tuck's (west) end, on the north rope. */
const FRAYED = 2;

export interface TuckBridge {
  group: THREE.Group;
  colliders: Collider[];
}

export function buildTuckBridge(valley: TerrainSampler): TuckBridge {
  const ground = groundOnly(valley);
  const at = (x: number, z: number): number => ground.heightAt(x, z);
  const ha = at(B.ax, B.az), hb = at(B.bx, B.bz);
  const len = B.bx - B.ax;
  const zc = B.az;
  const deck = (t: number): number => deckY(B, t, ha, hb);
  const xAt = (t: number): number => B.ax + len * t;
  /** Hand ropes hang from the post tops and sag less than the deck does. */
  const rope = (t: number): number => ha + (hb - ha) * t + 1.2 - 0.38 * Math.sin(Math.PI * t);
  const b = new GeoBuilder();

  // Planks, each tipped to the deck's slope at that point, a little uneven, one gone.
  const n = Math.floor(len / PLANK_PITCH);
  for (let i = 0; i < n; i++) {
    if (i === Math.floor(n * 0.62)) continue;
    const t = (i + 0.5) / n;
    const tilt = Math.atan2(deck(t + 0.01) - deck(t - 0.01), len * 0.02);
    const wobble = Math.sin(i * 2.7) * 0.05;
    b.add(GEO.box, propMatrix(xAt(t), deck(t) - 0.05, zc + wobble * 0.6, 0.32, 0.09, 1.86, wobble, 0, tilt),
      i % 3 === 1 ? 'WOOD_MID' : 'WOOD_LT', 'SNOW_LT');
  }

  // Carrier ropes under the plank ends, and the two hand ropes with drop lines down to the deck.
  for (let k = 0; k < ROPE_SEGMENTS; k++) {
    const t0 = k / ROPE_SEGMENTS, t1 = (k + 1) / ROPE_SEGMENTS;
    for (const side of [-1, 1]) {
      b.strut([xAt(t0), deck(t0) - 0.1, zc + side * 0.92], [xAt(t1), deck(t1) - 0.1, zc + side * 0.92], 0.05, 'BRUSH');
      const frayed = side === 1 && k === FRAYED;
      const a: Triple = [xAt(t0), rope(t0), zc + side * RAIL];
      const c: Triple = [xAt(t1), rope(t1), zc + side * RAIL];
      b.strut(a, c, frayed ? 0.022 : 0.045, frayed ? 'PIP_WING' : 'BRUSH');
      if (frayed) {
        // Loose strands where the lay has opened: short pale whiskers off the thin stretch.
        for (let s = 0; s < 4; s++) {
          const f = 0.25 + s * 0.17;
          const p: Triple = [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, a[2]];
          b.strut(p, [p[0] + 0.12 * (s % 2 ? 1 : -1), p[1] - 0.14 - 0.05 * s, p[2] + 0.1], 0.012, 'SUN_MID');
        }
      }
      if (k % 2 === 1) b.strut([xAt(t1), rope(t1), zc + side * RAIL], [xAt(t1), deck(t1) - 0.05, zc + side * 0.92], 0.02, 'BRUSH');
    }
  }

  // Anchor posts, lashed, snow-capped, each held back by a stay to a stake in the snow.
  const posts: { x: number; z: number }[] = [];
  for (const [end, out] of [[0, -1], [1, 1]] as const) {
    const ex = xAt(end) + out * 0.45;
    for (const side of [-1, 1]) {
      const pz = zc + side * POST_OUT;
      const y = at(ex, pz);
      posts.push({ x: ex, z: pz });
      b.cyl(ex, y - 0.3, pz, 0.15, 1.85, 'WOOD_DK');
      b.box(ex, y + 1.5, pz, 0.36, 0.08, 0.36, 'WOOD_DK', 'SNOW_HI');
      for (const dy of [1.05, 1.22]) b.box(ex, y + dy, pz, 0.34, 0.07, 0.34, 'BRUSH');
      // The hand rope runs in from the post top to the first span point.
      b.strut([ex, y + 1.2, pz], [xAt(end), rope(end), zc + side * RAIL], 0.045, 'BRUSH');
      const sx = ex + out * 1.7, sz = pz + side * 0.5;
      b.strut([ex, y + 1.3, pz], [sx, at(sx, sz) + 0.25, sz], 0.035, 'BRUSH');
      b.cyl(sx, at(sx, sz) - 0.2, sz, 0.07, 0.55, 'WOOD_MID');
    }
  }

  // The old rope, coiled on the snow by the west posts, and Tuck's mallet on the coil.
  const cx = B.ax - 2.2, cz = zc + 2.9, cy = at(cx, cz);
  for (let r = 0; r < 3; r++) {
    const rad = 0.42 - r * 0.09;
    for (let i = 0; i < 9; i++) {
      const a0 = (i / 9) * Math.PI * 2, a1 = ((i + 1) / 9) * Math.PI * 2;
      b.strut([cx + Math.cos(a0) * rad, cy + 0.06 + r * 0.07, cz + Math.sin(a0) * rad],
        [cx + Math.cos(a1) * rad, cy + 0.06 + r * 0.07, cz + Math.sin(a1) * rad], 0.045, 'BRUSH');
    }
  }
  b.strut([cx - 0.1, cy + 0.3, cz], [cx + 0.6, cy + 0.12, cz + 0.4], 0.03, 'WOOD_LT');
  b.box(cx - 0.18, cy + 0.2, cz - 0.04, 0.26, 0.16, 0.16, 'WOOD_DK');

  const mesh = b.finish('tuck-bridge');
  mesh.userData.noCollide = true;
  const group = new THREE.Group();
  group.name = 'tuck-bridge';
  group.add(mesh);

  // Hand ropes: a funnel in from each pair of posts to the rail line, then straight across.
  const colliders: Collider[] = [];
  for (const side of [-1, 1]) {
    const w0 = xAt(0) - 0.45, w1 = xAt(0) + 1.2, e1 = xAt(1) - 1.2, e0 = xAt(1) + 0.45;
    const zr = zc + side * RAIL, zp = zc + side * POST_OUT;
    colliders.push(
      { kind: 'segment', ax: w0, az: zp, bx: w1, bz: zr, r: 0.08 },
      { kind: 'segment', ax: w1, az: zr, bx: e1, bz: zr, r: 0.08 },
      { kind: 'segment', ax: e1, az: zr, bx: e0, bz: zp, r: 0.08 },
    );
  }
  for (const p of posts) colliders.push({ kind: 'circle', x: p.x, z: p.z, r: 0.3 });
  return { group, colliders };
}
