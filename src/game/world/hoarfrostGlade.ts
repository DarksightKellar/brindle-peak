/**
 * The hoarfrost glade in Pinewind, where Wren sends you for a photograph and the deer stands.
 *
 * It was named and never drawn: the "glade" was the middle of the wood, as thick with green pines as
 * anywhere else, and nothing in it was frosted. Now it is a clearing (the scatter is cleared off it,
 * namedPlaces.ts) ringed with things hoarfrost has grown on: birches and dead saplings with every twig
 * thickened white, clumps of frosted grass, young pines furred white to the tip, and a floor of frost
 * that glitters, pale where the rest of the wood's snow is blue.
 *
 * The viewpoint (-219, 141) looks west across it at the deer (-229, 139), side-on against open snow;
 * nothing stands on that line or just beyond the deer, nor on the Deer Trail Run's gates that pass through.
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import type { Collider } from '../../core/player/collide';
import { GEO, GeoBuilder, propMatrix } from './geoBuilder';
import { frozenPond } from './frozenWater';

export const GLADE = { x: -228, z: 146, r: 11 } as const;
/** Kept clear: the photo's line of sight and the race gates through the glade. */
const KEEP_CLEAR: readonly { x: number; z: number; r: number }[] = [
  { x: -219, z: 141, r: 3 }, { x: -224, z: 140, r: 2.5 }, { x: -229, z: 139, r: 3 },
  { x: -233, z: 138.3, r: 2.5 }, { x: -237, z: 137.5, r: 2.5 },
  { x: -232, z: 134, r: 4.5 }, { x: -214, z: 148, r: 4.5 }, { x: -221, z: 166, r: 4 },
];

/** A birch furred with rime: pale trunk, every branch doubled by a thicker white sleeve. */
function rimedBirch(b: GeoBuilder, x: number, y: number, z: number, h: number, seed: number): void {
  b.cyl(x, y - 0.1, z, 0.13, h * 0.75, 'ROCK_LT');
  for (let i = 0; i < 6; i++) {
    const a = seed + i * 2.4;
    const y0 = y + h * (0.32 + 0.09 * i);
    const len = 1.2 * (1 - 0.08 * i);
    const tip: [number, number, number] = [x + Math.cos(a) * len, y0 + len * 0.7, z + Math.sin(a) * len];
    b.strut([x, y0, z], tip, 0.05, 'BARK');
    b.strut([x, y0 + 0.04, z], [tip[0], tip[1] + 0.05, tip[2]], 0.09, 'SNOW_HI');
    b.add(GEO.octa, propMatrix(tip[0], tip[1] + 0.05, tip[2], 0.16, 0.16, 0.16, a), 'ICE_HI');
  }
  b.add(GEO.octa, propMatrix(x, y + h * 0.8, z, 0.3, 0.45, 0.3, seed), 'SNOW_HI');
}

/** A young pine furred white to the tip: the green only shows in the gaps. */
function frostedPine(b: GeoBuilder, x: number, y: number, z: number, h: number): void {
  b.cyl(x, y - 0.1, z, 0.12, h * 0.3, 'BARK');
  for (let i = 0; i < 3; i++) {
    const r = 1.0 * (1 - 0.28 * i), ty = y + h * (0.2 + 0.25 * i);
    b.cone(x, ty, z, r, h * 0.38, i === 1 ? 'PINE_HI' : 'SNOW_HI', 6);
    b.cone(x, ty + 0.05, z, r * 0.92, h * 0.3, 'SNOW_HI', 5);
  }
}

/** Frosted grass: stiff white blades in a tuft, tipped with ice. */
function frostTuft(b: GeoBuilder, x: number, y: number, z: number, seed: number): void {
  for (let i = 0; i < 5; i++) {
    const a = seed + i * 1.26;
    const tip: [number, number, number] = [x + Math.cos(a) * 0.35, y + 0.55 + 0.1 * (i % 3), z + Math.sin(a) * 0.35];
    b.strut([x, y - 0.05, z], tip, 0.035, i % 2 ? 'SNOW_HI' : 'ICE_HI');
  }
}

export interface Glade {
  group: THREE.Group;
  colliders: Collider[];
}

export function buildHoarfrostGlade(sampler: TerrainSampler): Glade {
  const group = new THREE.Group();
  group.name = 'hoarfrost-glade';
  const b = new GeoBuilder();
  const colliders: Collider[] = [];
  const free = (x: number, z: number): boolean => KEEP_CLEAR.every((c) => Math.hypot(x - c.x, z - c.z) > c.r);
  const y = (x: number, z: number): number => sampler.heightAt(x, z);

  // The ring: birches and frosted pines round the edge, alternating, a little irregular.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2 * Math.sin(i * 3.1);
    const r = GLADE.r - 1.5 + 2.5 * Math.sin(i * 1.7) ** 2;
    const x = GLADE.x + Math.cos(a) * r, z = GLADE.z + Math.sin(a) * r;
    if (!free(x, z)) continue;
    if (i % 2) frostedPine(b, x, y(x, z), z, 3.6 + (i % 3) * 0.8);
    else rimedBirch(b, x, y(x, z), z, 4.2 + (i % 3) * 0.7, i);
    colliders.push({ kind: 'circle', x, z, r: 0.35 });
  }
  // Tufts through the clearing, thickest round the edge.
  for (let i = 0; i < 40; i++) {
    const a = i * 2.399, r = 2 + (GLADE.r - 2) * Math.sqrt(((i * 37) % 40) / 40);
    const x = GLADE.x + Math.cos(a) * r, z = GLADE.z + Math.sin(a) * r;
    if (free(x, z)) frostTuft(b, x, y(x, z), z, i);
  }
  const mesh = b.finish('hoarfrost');
  mesh.userData.noCollide = true;
  group.add(mesh);

  // The frost floor: a pale, glittering ice-white sheet across the clearing, under everything.
  const floor = frozenPond(sampler, GLADE.x, GLADE.z, GLADE.r - 1, true);
  floor.name = 'hoarfrost-floor';
  group.add(floor);
  return { group, colliders };
}
