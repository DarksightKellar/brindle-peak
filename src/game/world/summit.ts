/**
 * The goal of the whole game: the radio mast on Brindle Peak, and Edda's radio set.
 *
 * The mast used to be a 15 u lattice in rock grey — on snow under a blue sky, a faint blue frame —
 * and the set it exists for was never drawn. Now:
 *
 *  - The mast is 24 u of lattice painted in red and white bands, the way real masts are, with a red
 *    beacon and a halo on top. Red-and-white is the one pattern nothing else in the valley wears, so
 *    it reads as "the mast" from anywhere it can be seen. farPeak.ts carries it through the haze.
 *  - Edda's radio hut stands between the mast and where Edda keeps watch, with the set on a bench
 *    under the eave: a dark box with a lit dial, a handset, the battery crate the batteries go into,
 *    and the feed line running on short poles to the foot of the mast.
 *
 * Built as a group whose meshes each stand on the terrain at their own anchor (the landmark test
 * asserts that). Colliders are explicit — the guy wires would otherwise box out half the summit.
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import { PALETTE } from '../../core/palette';
import { GeoBuilder, propMatrix, GEO } from './geoBuilder';
import { haloSprite } from './halo';

/** Mast height, foot to beacon. */
export const MAST_HEIGHT = 24;
/** Where the radio hut stands: between the mast and Edda, its porch turned toward her. */
export const RADIO_HUT = { x: 341, z: -353, faceX: 348, faceZ: -350 } as const;

const LEG_BASE = 1.7;
const LEG_TOP = 0.42;
const BANDS = 6;

const corner = (k: number, w: number, y: number): [number, number, number] => {
  const a = Math.PI / 4 + (k / 4) * Math.PI * 2;
  return [Math.cos(a) * w, y, Math.sin(a) * w];
};
const widthAt = (y: number): number => LEG_BASE + (LEG_TOP - LEG_BASE) * (y / MAST_HEIGHT);

/** Lattice in red and white bands, X-braced, with a work platform and an antenna head. */
function mast(b: GeoBuilder, hutAngle: number): void {
  b.box(0, -0.4, 0, 3.6, 0.9, 3.6, 'ROCK_LT', 'SNOW_LT');
  for (let band = 0; band < BANDS; band++) {
    const y0 = (MAST_HEIGHT * band) / BANDS;
    const y1 = (MAST_HEIGHT * (band + 1)) / BANDS;
    // Red bands are painted in the unlit bucket: the mast is usually seen against the low sun, and
    // lit red in shade went the same dark blue as the steel. Paint that holds its colour is the point.
    const red = band % 2 === 0;
    const paint = red ? 'PIP_SCARF' : 'SNOW_HI';
    for (let k = 0; k < 4; k++) {
      b.glow(red);
      b.strut(corner(k, widthAt(y0), y0), corner(k, widthAt(y1), y1), 0.2, paint);
      b.strut(corner(k, widthAt(y1), y1), corner(k + 1, widthAt(y1), y1), 0.09, paint);
      b.glow(false);
      // One diagonal per face per band, alternating, so each face reads as a zig-zag lattice.
      const from = red ? k : k + 1;
      b.strut(corner(from, widthAt(y0), y0), corner(from === k ? k + 1 : k, widthAt(y1), y1), 0.07, 'ROCK_LT');
    }
  }
  // Platform two thirds up, and the antenna head: crossed dipoles and a whip.
  b.add(GEO.box, propMatrix(0, 16.2, 0, 2.2, 0.12, 2.2, Math.PI / 4), 'ROCK_DK', 'SNOW_LT', 0.5);
  b.strut([-2.2, MAST_HEIGHT - 1.2, 0], [2.2, MAST_HEIGHT - 1.2, 0], 0.07, 'ROCK_LT');
  b.strut([0, MAST_HEIGHT - 2.2, -1.8], [0, MAST_HEIGHT - 2.2, 1.8], 0.07, 'ROCK_LT');
  b.strut([0, MAST_HEIGHT, 0], [0, MAST_HEIGHT + 3.2, 0], 0.05, 'ROCK_LT');
  // Three guy wires to anchor blocks, spread round the side away from the hut.
  for (const a of [hutAngle + 2.1, hutAngle + Math.PI, hutAngle + 4.2]) {
    const top: [number, number, number] = [Math.cos(a) * 0.5, MAST_HEIGHT - 4, Math.sin(a) * 0.5];
    const foot: [number, number, number] = [Math.cos(a) * 10, 0.2, Math.sin(a) * 10];
    b.strut(top, foot, 0.035, 'ROCK_DK');
    b.box(foot[0], -0.3, foot[2], 0.8, 0.6, 0.8, 'ROCK_MID', 'SNOW_LT');
  }
  b.glow();
  b.add(GEO.octa, propMatrix(0, MAST_HEIGHT + 0.5, 0, 0.42, 0.55, 0.42), 'PIP_SCARF');
  b.glow(false);
}

/**
 * Edda's hut and her set, in local space with the porch facing +z. `cable` is the foot of the mast
 * in the same frame, where the feed line ends.
 */
function radioHut(b: GeoBuilder, cable: [number, number]): void {
  const w = 3.4, d = 2.6, h = 2.3;
  b.box(0, -0.6, 0, w, h + 0.6, d, 'WOOD_MID');
  // Single-pitch roof falling to the back, with a deep eave over the porch, and its snow.
  b.add(GEO.box, propMatrix(0, h + 0.25, 0.5, w + 0.7, 0.16, d + 2.0, 0, 0.16), 'WOOD_DK', 'SNOW_LT', 0.5);
  b.add(GEO.box, propMatrix(0, h + 0.42, 0.5, w + 0.6, 0.18, d + 1.9, 0, 0.16), 'SNOW_LT', 'SNOW_HI', 0.5);
  for (const sx of [-1, 1]) b.cyl(sx * (w / 2 + 0.1), -0.2, d / 2 + 1.35, 0.09, h + 0.55, 'WOOD_DK');
  b.box(-0.9, 0, d / 2 + 0.01, 0.8, 1.8, 0.06, 'WOOD_DK');
  // The bench and the set on it: dark case, lit dial, two knobs, the handset on its hook.
  b.box(0.6, -0.1, d / 2 + 0.7, 1.9, 0.75, 0.7, 'WOOD_LT', 'WOOD_LT');
  b.box(0.75, 0.65, d / 2 + 0.65, 1.15, 0.62, 0.55, 'ROCK_DK');
  b.box(0.2, 0.65, d / 2 + 0.75, 0.32, 0.22, 0.4, 'PIP_SCARF');
  b.strut([1.3, 1.27, d / 2 + 0.6], [1.3, 2.3, d / 2 + 0.6], 0.03, 'ROCK_LT');
  // The battery crate, open, waiting.
  b.box(-0.6, -0.1, d / 2 + 0.9, 0.7, 0.5, 0.55, 'WOOD_MID', 'WOOD_DK');
  // Feed line: up from the set, over the roof, and away on short poles to the mast foot.
  const [mx, mz] = cable;
  b.strut([1.3, 2.3, d / 2 + 0.6], [1.3, h + 0.9, 0], 0.03, 'ROCK_DK');
  let last: [number, number, number] = [1.3, h + 0.9, 0];
  for (let i = 1; i <= 3; i++) {
    const t = i / 3.4;
    const px = 1.3 + (mx - 1.3) * t, pz = (mz) * t;
    b.cyl(px, -0.2, pz, 0.06, 2.4, 'WOOD_DK');
    b.strut(last, [px, 2.2, pz], 0.025, 'ROCK_DK');
    last = [px, 2.2, pz];
  }
  b.strut(last, [mx, 1.0, mz], 0.025, 'ROCK_DK');
  b.glow();
  b.add(GEO.quad, propMatrix(0.95, 1.0, d / 2 + 0.93, 0.5, 0.3, 1), 'LANTERN');
  b.add(GEO.octa, propMatrix(0.45, 0.82, d / 2 + 0.95, 0.06, 0.06, 0.04), 'AMBER');
  b.add(GEO.octa, propMatrix(0.6, 0.82, d / 2 + 0.95, 0.06, 0.06, 0.04), 'AMBER');
  // The hut's one window, lit: the only warm light at the top of the world.
  b.quad([w / 2 + 0.02, 0.9, -0.5], [w / 2 + 0.02, 0.9, 0.4], [w / 2 + 0.02, 1.7, 0.4], [w / 2 + 0.02, 1.7, -0.5], 'LANTERN', [w, 1.3, 0]);
  b.glow(false);
}

export interface Summit {
  group: THREE.Group;
  colliders: Collider[];
}

/** The mast at (x, z) and the hut beside it. */
export function buildSummit(sampler: TerrainSampler, x: number, z: number): Summit {
  const group = new THREE.Group();
  group.name = 'landmark:mast';
  const mb = new GeoBuilder();
  mast(mb, Math.atan2(RADIO_HUT.z - z, RADIO_HUT.x - x));
  const mastMesh = mb.finish('mast');
  mastMesh.position.set(x, sampler.heightAt(x, z), z);
  mastMesh.userData.noCollide = true;
  const beacon = haloSprite(PALETTE.PIP_SCARF, 4.2, 0.7);
  beacon.position.set(0, MAST_HEIGHT + 0.5, 0);
  mastMesh.add(beacon);
  group.add(mastMesh);

  const { x: hx, z: hz } = RADIO_HUT;
  const yaw = Math.atan2(RADIO_HUT.faceX - hx, RADIO_HUT.faceZ - hz);
  // The mast foot in the hut's frame: undo the hut's yaw on the offset.
  const ox = x - hx, oz = z - hz;
  const cable: [number, number] = [ox * Math.cos(yaw) - oz * Math.sin(yaw), ox * Math.sin(yaw) + oz * Math.cos(yaw)];
  const hb = new GeoBuilder();
  radioHut(hb, cable);
  const hut = hb.finish('radio-hut');
  hut.position.set(hx, sampler.heightAt(hx, hz), hz);
  hut.rotation.y = yaw;
  hut.userData.noCollide = true;
  group.add(hut);

  const colliders: Collider[] = [
    { kind: 'circle', x, z, r: 2.1 },
    { kind: 'box', x: hx, z: hz, hw: 1.7, hd: 1.3, yaw },
  ];
  return { group, colliders };
}
