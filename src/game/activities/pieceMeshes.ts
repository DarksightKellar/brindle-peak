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
 * Round 10: the warm fawn ball on stilts (built light because dark mid-browns read as a dead bush)
 * looked like a toy, and the director asked for a deer that belongs in the snow. Now it wears a roe's
 * winter coat, grey-brown with snow settled on its back; the body is a deep chest and a rounder haunch
 * rather than one egg; the legs thicken at the thigh and go dark below the hock; the head tapers to a
 * dark muzzle. The white rump, the pale throat, the big ears and the head held up still say "deer" at
 * 384 x 216, against the open snow it stands on.
 */
function deer(b: GeoBuilder): void {
  // Chest, deeper and forward; haunch, rounder and behind; a back between them. Snow lies on the top.
  b.add(GEO.ico, propMatrix(0, 0.86, 0.2, 0.2, 0.25, 0.3), 'ROCK_WARM', 'SNOW_LT', 0.75);
  b.add(GEO.ico, propMatrix(0, 0.9, -0.24, 0.19, 0.22, 0.27), 'ROCK_WARM', 'SNOW_LT', 0.75);
  b.add(GEO.ico, propMatrix(0, 0.78, -0.02, 0.15, 0.13, 0.3), 'SNOW_LT'); // pale belly
  b.add(GEO.ico, propMatrix(0, 0.92, -0.47, 0.13, 0.15, 0.07), 'SNOW_HI'); // the white rump
  // Legs: coat-coloured thighs, dark slender shanks, the hind ones bent back at the hock.
  for (const x of [-0.11, 0.11]) {
    b.strut([x, 0.82, 0.3], [x, 0.44, 0.32], 0.06, 'ROCK_WARM');
    b.strut([x, 0.44, 0.32], [x, 0, 0.33], 0.032, 'WOOD_DK');
    b.strut([x, 0.86, -0.3], [x, 0.42, -0.4], 0.07, 'ROCK_WARM');
    b.strut([x, 0.42, -0.4], [x, 0, -0.33], 0.032, 'WOOD_DK');
  }
  b.strut([0, 0.98, 0.36], [0, 1.32, 0.58], 0.09, 'ROCK_WARM'); // neck, up and forward
  b.add(GEO.ico, propMatrix(0, 1.12, 0.52, 0.07, 0.08, 0.05), 'SNOW_HI'); // pale throat
  b.add(GEO.ico, propMatrix(0, 1.38, 0.66, 0.1, 0.11, 0.14), 'ROCK_WARM', 'SNOW_LT', 0.85);
  // A tapering muzzle, pale round a dark nose.
  b.add(GEO.cone5, propMatrix(0, 1.34, 0.84, 0.07, 0.18, 0.07, 0, Math.PI / 2), 'ROCK_LT');
  b.add(GEO.octa, propMatrix(0, 1.34, 0.93, 0.045, 0.045, 0.045), 'PIP_GLASS'); // nose
  for (const side of [-1, 1]) {
    b.add(GEO.octa, propMatrix(side * 0.08, 1.42, 0.72, 0.022, 0.022, 0.022), 'PIP_GLASS'); // eyes
    b.add(GEO.cone5, propMatrix(side * 0.1, 1.54, 0.6, 0.065, 0.17, 0.035, 0, 0, -side * 0.55), 'ROCK_WARM'); // ears
    // Short winter antlers, still in velvet: a buck's grow back over the cold months.
    b.strut([side * 0.035, 1.47, 0.63], [side * 0.07, 1.68, 0.6], 0.02, 'WOOD_MID');
  }
}

/**
 * The pinecone toss's target: a little snowman, about two metres, face toward +Z. It replaced a bare
 * red pillar the critic read as a placeholder; the dark hat and red scarf are what read on snow.
 */
function snowmanTarget(b: GeoBuilder): void {
  b.add(GEO.ico, propMatrix(0, 0.5, 0, 0.58, 0.52, 0.58), 'SNOW_LT', 'SNOW_HI', 0.3);
  b.add(GEO.ico, propMatrix(0, 1.2, 0, 0.42, 0.4, 0.42, 0.5), 'SNOW_LT', 'SNOW_HI', 0.3);
  b.add(GEO.ico, propMatrix(0, 1.74, 0, 0.3, 0.29, 0.3, 1.1), 'SNOW_LT', 'SNOW_HI', 0.3);
  b.add(GEO.stump, propMatrix(0, 1.5, 0, 0.34, 0.1, 0.34), 'PIP_SCARF');
  b.add(GEO.box, propMatrix(0.2, 1.36, 0.22, 0.12, 0.3, 0.05, -0.4), 'PIP_SCARF'); // the scarf's tail
  b.add(GEO.stump, propMatrix(0, 2.0, 0, 0.32, 0.05, 0.32), 'PIP_GLASS'); // hat brim
  b.add(GEO.stump, propMatrix(0, 2.14, 0, 0.21, 0.26, 0.21), 'PIP_GLASS');
  b.add(GEO.cone5, propMatrix(0, 1.74, 0.42, 0.06, 0.26, 0.06, 0, Math.PI / 2), 'AMBER');
  for (const side of [-1, 1]) b.add(GEO.octa, propMatrix(side * 0.11, 1.84, 0.26, 0.05, 0.05, 0.05), 'PIP_GLASS');
  for (const y of [1.08, 1.26]) b.add(GEO.octa, propMatrix(0, y, 0.4, 0.05, 0.05, 0.05), 'PIP_GLASS');
}

const BUILDERS: Readonly<Record<Solid, (b: GeoBuilder) => void>> = {
  'snowman-target': snowmanTarget,
  ...START_BUILDERS,
  log,
  pool,
  hole,
  deer,
  // Unit radius, resting on its base: centre one radius up. Critic round 18 read the 20-face balls as
  // gems or boulders; rolled snow is rounder than a rock.
  snowball: (b) => b.add(GEO.ico1, propMatrix(0, 0.92, 0, 1, 0.94, 1), 'SNOW_LT', 'SNOW_HI', 0.25),
  // The toss targets' hat and scarf (snowmanTarget), for the snowman Pip builds: they are what read on snow.
  hat: (b) => {
    b.add(GEO.stump, propMatrix(0, 0, 0, 0.3, 0.05, 0.3), 'PIP_GLASS');
    b.add(GEO.stump, propMatrix(0, 0.15, 0, 0.2, 0.26, 0.2), 'PIP_GLASS');
  },
  scarf: (b) => {
    b.add(GEO.stump, propMatrix(0, 0, 0, 0.32, 0.1, 0.32), 'PIP_SCARF');
    b.add(GEO.box, propMatrix(0.18, -0.15, 0.22, 0.12, 0.3, 0.05, -0.4), 'PIP_SCARF');
  },
  stone: (b) => b.add(GEO.ico, propMatrix(0, 0.5, 0, 1, 0.62, 0.85, 0.4), 'ROCK_MID', 'ROCK_SNOWCAP', 0.5),
  // The dam's stone in hand, warm in Pip's lantern light: drawn like the wall's cold blue stones, critic
  // round 67 could not tell it from them, and took a signpost's lit arm for it.
  'stone-held': (b) => b.add(GEO.ico, propMatrix(0, 0.5, 0, 1, 0.62, 0.85, 0.4), 'ROCK_WARM', 'SUN_MID', 0.5),
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
