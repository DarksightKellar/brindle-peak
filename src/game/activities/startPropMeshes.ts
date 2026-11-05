/**
 * What stands at the start of each activity, so you can see from across a clearing that something
 * is done here: a sled leaning on a post, a kite caught in a dead branch, a starting banner, a stool
 * and a rod by the water, a picture frame on a post at a viewpoint.
 *
 * Every one carries the same two things, so the player learns them once: a red pennant on a tall
 * post, and a small warm light at its tip that still reads at dusk. The rest says which kind of thing
 * it is. Built through GeoBuilder like every other prop, at unit size about the point it stands on;
 * +X is the prop's right as you approach it along -Z.
 */

import { GEO, GeoBuilder, propMatrix, type Triple } from '../world/geoBuilder';
import type { PaletteKey } from '../../core/palette';

export type StartLook =
  | 'pennant' | 'start-sled' | 'start-kite' | 'start-banner' | 'start-windsock' | 'start-stool'
  | 'start-frame' | 'start-snowballs' | 'start-cones' | 'start-skates' | 'start-shovel';

/** A flat shape that reads from both sides: each triangle twice, once per winding. */
function sheet(b: GeoBuilder, pts: readonly Triple[], color: PaletteKey): void {
  for (let i = 1; i + 1 < pts.length; i++) {
    b.tri(pts[0], pts[i], pts[i + 1], color);
    b.tri(pts[0], pts[i + 1], pts[i], color);
  }
}

/**
 * The shared mark: a tall post, a red pennant off its top, a warm light on the tip. The light is a round
 * globe: an amber diamond up there read as the quest marker (critic round 4).
 */
function pennant(b: GeoBuilder, x: number, z: number, h = 4.2): void {
  // Tall enough to stand over the snow drifts and rocks from thirty metres off.
  b.strut([x, 0, z], [x, h, z], 0.09, 'WOOD_DK');
  const top: Triple = [x, h - 0.08, z];
  const low: Triple = [x, h - 1.0, z];
  const tip: Triple = [x + 1.6, h - 0.6, z + 0.14];
  // A raised middle so the flag is never seen exactly edge-on.
  const mid: Triple = [x + 0.7, h - 0.52, z + 0.24];
  sheet(b, [top, low, mid], 'PIP_SCARF');
  sheet(b, [low, tip, mid], 'PIP_SCARF');
  sheet(b, [tip, top, mid], 'BRICK');
  // A lit lamp on the pole's top: unlit by the scene, so it shows after dark. Critic round 25 lost the
  // snowman, bell and chimney flags in the night palette, ten metres off.
  b.glow();
  b.add(GEO.ico, propMatrix(x, h + 0.3, z, 0.32, 0.32, 0.32), 'LANTERN');
  b.glow(false);
}

/** A sled leaning on the post: red deck, dark runners curling up at the front. */
function sled(b: GeoBuilder): void {
  pennant(b, 0, 0);
  const lean = 1.1; // top against the post, foot out toward the viewer
  b.add(GEO.box, propMatrix(0.05, 0.62, 0.42, 0.62, 0.09, 1.45, 0, lean), 'BRICK', 'PIP_SCARF', 0.2);
  for (const side of [-0.27, 0.33]) {
    b.strut([side, 0.02, 0.92], [side, 1.2, 0.08], 0.04, 'WOOD_DK');
    b.strut([side, 1.2, 0.08], [side, 1.36, 0.2], 0.04, 'WOOD_DK');
  }
}

/** A dead snag with Sable's spare kite caught in it, tail hanging. */
function kite(b: GeoBuilder): void {
  b.strut([0, 0, 0], [0.1, 2.6, 0], 0.13, 'BARK');
  b.strut([0.06, 1.7, 0], [1.3, 2.7, 0.15], 0.06, 'BARK');
  b.strut([0.08, 2.1, 0], [-0.6, 2.7, -0.05], 0.05, 'BARK');
  pennant(b, 0.1, 0, 4.4);
  // The kite, snagged at the branch tip and hanging nose-down a little: a cross-sticked diamond,
  // bigger than the pennant so it reads as a kite and not as a second flag, tail fluttering below.
  const c: Triple = [1.25, 1.75, 0.2];
  const up: Triple = [c[0] + 0.16, c[1] + 0.85, c[2]];
  const down: Triple = [c[0] - 0.14, c[1] - 1.05, c[2]];
  const left: Triple = [c[0] - 0.7, c[1] + 0.08, c[2] + 0.03];
  const right: Triple = [c[0] + 0.72, c[1] - 0.1, c[2] + 0.03];
  sheet(b, [c, up, left], 'PIP_SCARF');
  sheet(b, [c, left, down], 'SUN_MID');
  sheet(b, [c, down, right], 'PIP_SCARF');
  sheet(b, [c, right, up], 'SUN_MID');
  b.strut(up, down, 0.03, 'WOOD_DK');
  b.strut(left, right, 0.03, 'WOOD_DK');
  for (let k = 0; k < 4; k++) {
    const y = down[1] - 0.3 - k * 0.3;
    b.strut([down[0] - 0.06 * k, y + 0.3, down[2]], [down[0] - 0.06 * (k + 1), y, down[2]], 0.015, 'WOOD_DK');
    b.add(GEO.octa, propMatrix(down[0] - 0.06 * (k + 1), y, down[2], 0.13, 0.07, 0.04), k % 2 ? 'SUN_MID' : 'PIP_SCARF');
  }
}

/** Two posts and a string of bunting between them: the start line of a race. */
function banner(b: GeoBuilder): void {
  pennant(b, -1.5, 0, 4.2);
  b.strut([1.5, 0, 0], [1.5, 2.5, 0], 0.075, 'WOOD_DK');
  const flags: PaletteKey[] = ['PIP_SCARF', 'SUN_MID', 'LANTERN', 'PIP_SCARF', 'SUN_MID', 'LANTERN', 'PIP_SCARF'];
  flags.forEach((color, i) => {
    const x0 = -1.4 + i * 0.41, x1 = x0 + 0.34;
    const sag = (x: number): number => 2.42 - 0.22 * (1 - (x / 1.5) ** 2);
    sheet(b, [[x0, sag(x0), 0], [x1, sag(x1), 0], [(x0 + x1) / 2, sag((x0 + x1) / 2) - 0.36, 0.02]], color);
  });
}

/** A striped windsock on a pole, for the jump off the peak. */
function windsock(b: GeoBuilder): void {
  pennant(b, 0, 0, 4.6);
  for (let k = 0; k < 4; k++) {
    const r = 0.3 - k * 0.05;
    b.add(GEO.cyl5, propMatrix(-0.4 - k * 0.34, 3.9 - k * 0.06, 0, r, 0.34, r, 0, 0, Math.PI / 2 - 0.15), k % 2 ? 'SNOW_HI' : 'PIP_SCARF');
  }
}

/** A three-legged stool, a rod leant against the post, and a pail. */
function stool(b: GeoBuilder): void {
  pennant(b, 0, 0);
  b.add(GEO.stump, propMatrix(0.9, 0.52, 0.5, 0.3, 0.08, 0.3), 'WOOD_MID', 'WOOD_LT');
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.strut([0.9 + Math.cos(a) * 0.28, 0, 0.5 + Math.sin(a) * 0.28], [0.9 + Math.cos(a) * 0.14, 0.5, 0.5 + Math.sin(a) * 0.14], 0.035, 'WOOD_DK');
  }
  b.strut([-0.5, 0, 0.6], [0.05, 2.5, 0.05], 0.03, 'WOOD_LT');
  b.add(GEO.stump, propMatrix(-0.55, 0.18, 0.05, 0.2, 0.36, 0.2), 'ROCK_MID', 'WATER_DK', 0.9);
}

/** An empty picture frame on a post at eye height: look through here. Faces +Z, toward the subject. */
function frame(b: GeoBuilder): void {
  pennant(b, -0.95, 0);
  b.strut([0, 0, 0], [0, 1.15, 0], 0.06, 'WOOD_DK');
  const y0 = 1.15, y1 = 1.95, x = 0.5;
  const corners: Triple[] = [[-x, y0, 0], [x, y0, 0], [x, y1, 0], [-x, y1, 0]];
  corners.forEach((p, i) => b.strut(p, corners[(i + 1) % 4], 0.07, 'WOOD_LT'));
}

/** A crate heaped with what you throw. */
function crate(b: GeoBuilder, cones: boolean): void {
  pennant(b, 0, 0);
  b.add(GEO.box, propMatrix(0.85, 0.22, 0.35, 0.8, 0.44, 0.6), 'WOOD_MID', 'WOOD_DK');
  for (let k = 0; k < 5; k++) {
    const px = 0.6 + (k % 3) * 0.24, pz = 0.22 + Math.floor(k / 3) * 0.26 + (k % 2) * 0.04;
    if (cones) b.add(GEO.octa, propMatrix(px, 0.52, pz, 0.12, 0.17, 0.12, k), 'WOOD_LT', 'SUN_MID');
    else b.add(GEO.ico, propMatrix(px, 0.54, pz, 0.15, 0.15, 0.15, k), 'SNOW_LT', 'SNOW_HI', 0.3);
  }
}

/** A bench with a pair of skates on it. */
function skates(b: GeoBuilder): void {
  pennant(b, -0.2, 0);
  b.add(GEO.box, propMatrix(0.8, 0.5, 0.45, 1.3, 0.08, 0.36), 'WOOD_MID', 'SNOW_LT');
  for (const lx of [0.3, 1.3]) b.add(GEO.box, propMatrix(lx, 0.24, 0.45, 0.1, 0.48, 0.3), 'WOOD_DK');
  for (const sx of [0.62, 0.98]) {
    b.add(GEO.box, propMatrix(sx, 0.68, 0.45, 0.16, 0.26, 0.3), 'BRICK');
    b.add(GEO.box, propMatrix(sx, 0.56, 0.47, 0.03, 0.04, 0.42), 'ROCK_LT');
  }
}

/** A shovel stood in a heap of fresh snow. */
function shovel(b: GeoBuilder): void {
  pennant(b, -0.4, 0);
  b.add(GEO.ico, propMatrix(0.7, 0.12, 0.4, 0.7, 0.36, 0.6), 'SNOW_LT', 'SNOW_HI', 0.3);
  b.strut([0.75, 0.3, 0.4], [0.82, 1.6, 0.45], 0.04, 'WOOD_LT');
  b.add(GEO.box, propMatrix(0.74, 0.32, 0.4, 0.34, 0.42, 0.05, 0, 0, 0.05), 'PIP_SCARF');
}

export const START_BUILDERS: Readonly<Record<StartLook, (b: GeoBuilder) => void>> = {
  pennant: (b) => pennant(b, 0, 0),
  'start-sled': sled,
  'start-kite': kite,
  'start-banner': banner,
  'start-windsock': windsock,
  'start-stool': stool,
  'start-frame': frame,
  'start-snowballs': (b) => crate(b, false),
  'start-cones': (b) => crate(b, true),
  'start-skates': skates,
  'start-shovel': shovel,
};
