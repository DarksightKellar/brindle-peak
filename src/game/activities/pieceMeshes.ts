/**
 * The lit, flat-shaded pieces a build leaves in the world: logs, snowballs, stones, a carrot.
 *
 * Built through the same GeoBuilder as every prop and NPC, so a finished woodpile is shaded, faceted
 * and snow-capped exactly like the stumps and rocks around it instead of glowing like a HUD marker.
 * Each look is built once and shared: a placed piece is a Mesh pointing at the prototype's geometry
 * and material, so a whole snowman costs no new buffers.
 *
 * Every prototype is authored about the point it rests on, at unit size: `PlacedMarker.size`
 * scales it (a snowball's radius, a stone's span) and `yaw` turns it.
 */

import * as THREE from 'three';
import { GEO, GeoBuilder, propMatrix } from '../world/geoBuilder';
import type { PieceLook } from './markerLooks';
import { START_BUILDERS } from './startPropMeshes';

type Solid = Exclude<PieceLook, 'empty'>;

export const LOG = { radius: 0.25, length: 1.7 } as const;

function log(b: GeoBuilder): void {
  const { radius: r, length: l } = LOG;
  // Lying along local X. Freshly stacked, so no snow on it yet: bark sides, bright cut ends, which
  // is what makes a pile of five read as logs and not as one brown box at 384 x 216.
  b.add(GEO.stump, propMatrix(0, r, 0, r, l, r, 0, 0, Math.PI / 2), 'WOOD_MID', 'WOOD_LT', 0.5);
  for (const end of [-1, 1]) {
    b.add(GEO.stump, propMatrix((end * l) / 2, r, 0, r * 0.9, 0.05, r * 0.9, 0, 0, Math.PI / 2), 'SUN_MID');
  }
}

/** A pool at unit radius: dark water just above the ground, ringed with snow-capped stones. */
function pool(b: GeoBuilder): void {
  // Two pentagonal discs a fifth-turn apart make a ten-sided pool, round enough at 384 x 216.
  for (const turn of [0, Math.PI / 5]) b.add(GEO.stump, propMatrix(0, 0.02, 0, 1, 0.03, 1, turn), 'WATER_DEEP');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + (i % 3) * 0.12;
    const s = 0.11 + (i % 3) * 0.03;
    b.add(GEO.ico, propMatrix(Math.cos(a) * 1.08, 0.03, Math.sin(a) * 1.08, s * 1.3, s, s, a), 'ROCK_MID', 'ROCK_SNOWCAP', 0.5);
  }
}

/** A hole cut in the ice at unit radius, the cut blocks heaped round it. */
function hole(b: GeoBuilder): void {
  for (const turn of [0, Math.PI / 5]) b.add(GEO.stump, propMatrix(0, 0.03, 0, 1, 0.03, 1, turn), 'WATER_DK');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.add(GEO.box, propMatrix(Math.cos(a) * 1.45, 0.11, Math.sin(a) * 1.45, 0.46, 0.22, 0.32, a + 0.4), 'ICE_HI', 'SNOW_HI');
  }
}

/**
 * A roe deer standing side-on, about a metre at the shoulder: the glade's photograph. Faces +Z.
 *
 * Built light: in the dark mid-browns it read as a dead bush against the pines. A warm fawn coat, a
 * white rump and throat, big ears and a head held up are what make it a deer at 384 x 216.
 */
function deer(b: GeoBuilder): void {
  b.add(GEO.ico, propMatrix(0, 0.95, 0, 0.27, 0.28, 0.58), 'WOOD_LT', 'SUN_MID', 0.35);
  b.add(GEO.ico, propMatrix(0, 0.98, -0.54, 0.16, 0.17, 0.09), 'SNOW_HI'); // the white rump
  for (const [x, z] of [[-0.13, 0.38], [0.13, 0.38], [-0.13, -0.38], [0.13, -0.38]]) {
    b.strut([x, 0, z], [x, 0.86, z], 0.055, 'WOOD_MID');
  }
  b.strut([0, 1.05, 0.44], [0, 1.36, 0.62], 0.11, 'WOOD_LT'); // neck, up and forward
  b.add(GEO.ico, propMatrix(0, 1.18, 0.58, 0.09, 0.1, 0.06), 'SNOW_HI'); // pale throat
  b.add(GEO.ico, propMatrix(0, 1.44, 0.74, 0.13, 0.13, 0.22), 'WOOD_LT', 'SUN_MID', 0.4);
  b.add(GEO.octa, propMatrix(0, 1.4, 0.94, 0.06, 0.06, 0.06), 'PIP_GLASS'); // nose
  for (const side of [-1, 1]) {
    b.add(GEO.cone5, propMatrix(side * 0.12, 1.62, 0.68, 0.08, 0.2, 0.04, 0, 0, -side * 0.6), 'SUN_MID'); // ears
    b.strut([side * 0.04, 1.54, 0.7], [side * 0.08, 1.86, 0.66], 0.025, 'BARK'); // short antlers
  }
}

const BUILDERS: Readonly<Record<Solid, (b: GeoBuilder) => void>> = {
  ...START_BUILDERS,
  log,
  pool,
  hole,
  deer,
  // Unit radius, resting on its base: centre one radius up.
  snowball: (b) => b.add(GEO.ico, propMatrix(0, 0.92, 0, 1, 0.94, 1), 'SNOW_LT', 'SNOW_HI', 0.25),
  stone: (b) => b.add(GEO.ico, propMatrix(0, 0.5, 0, 1, 0.62, 0.85, 0.4), 'ROCK_MID', 'ROCK_SNOWCAP', 0.5),
  // Points along +Z: the snowman's face is its local forward.
  carrot: (b) => b.add(GEO.cone5, propMatrix(0, 0, 0.16, 0.07, 0.34, 0.07, 0, Math.PI / 2), 'AMBER'),
  coal: (b) => b.add(GEO.octa, propMatrix(0, 0, 0, 0.065, 0.065, 0.065), 'PIP_GLASS'),
  // Runs along +X from the shoulder, with one fork near the hand.
  twig: (b) => {
    b.strut([0, 0, 0], [0.8, 0, 0], 0.035, 'BARK');
    b.strut([0.52, 0, 0], [0.74, 0.16, 0.02], 0.025, 'BARK');
  },
};

const cache = new Map<Solid, THREE.Mesh>();

/** A fresh mesh sharing the look's prototype geometry and material, or null for `empty`. */
export function makePiece(look: PieceLook): THREE.Mesh | null {
  if (look === 'empty') return null;
  let proto = cache.get(look);
  if (!proto) {
    const b = new GeoBuilder();
    BUILDERS[look](b);
    proto = b.finish(`piece:${look}`);
    cache.set(look, proto);
  }
  const mesh = new THREE.Mesh(proto.geometry, proto.material);
  mesh.name = proto.name;
  // Grounded like every other prop (assemble.ts sets the same pair on the world group).
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function disposePieces(): void {
  for (const proto of cache.values()) {
    proto.geometry.dispose();
    const mats = Array.isArray(proto.material) ? proto.material : [proto.material];
    for (const m of mats) m.dispose();
  }
  cache.clear();
}
