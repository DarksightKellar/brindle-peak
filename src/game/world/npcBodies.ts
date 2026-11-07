/**
 * The actors: NPC bodies and the pickups a player walks over.
 *
 * Split from `assemble.ts`, which had two jobs — modelling the things that move or can be collected,
 * and composing the static world (terrain, scatter, landmarks, water, and their draw budget). Bodies
 * are built from three primitives with flat shading; what each species adds lives in npcSpecies.ts.
 */

import * as THREE from 'three';
import type { NpcDef } from '../../core/contracts';
import { PALETTE } from '../../core/palette';
import type { PickupDef } from '../../data/pickups';
import { HEAD_Y, isBird, type Kit, SPECIES_MARKS, SPECIES_SIZE } from './npcSpecies';
import { haloSprite } from './halo';

const FLAT = { flatShading: true } as const;

const lam = (hex: string): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), ...FLAT });

/**
 * A coat keeps a little of its own colour in shade. Under the valley's strong blue sky light a white
 * ptarmigan's shaded side turned the same grey-blue as Pip and the snow (critic: Nana "reads grey-blue
 * like Pip"); a small self-lit share of the coat colour holds white as white and russet as russet.
 */
const COAT_SELF_LIGHT = 0.2;
const coat = (hex: string): THREE.MeshLambertMaterial => {
  const m = lam(hex);
  m.emissive.copy(m.color).multiplyScalar(COAT_SELF_LIGHT);
  return m;
};

/** Unlit and excluded from the normal pass — for anything that glows. */
export const glow = (hex: string, opacity = 1): THREE.MeshBasicMaterial => {
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex),
    transparent: opacity < 1,
    opacity,
  });
  m.allowOverride = false;
  return m;
};

const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => new THREE.Mesh(geo, mat);

const SPHERE = new THREE.SphereGeometry(1, 6, 4);
const CONE = new THREE.ConeGeometry(1, 1, 5);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 7);
const GEOS = { sphere: SPHERE, cone: CONE, cyl: CYL } as const;

/** A standard villager is this many world units to the top of the head — just over Pip's 1.5. */
const VILLAGER_HEIGHT = 1.6;

/*
 * Knitwear: every villager wears one warm-coloured scarf (Nana a shawl). It is the "touch of colour"
 * that lifts a pale body off pale snow, and it puts the cast in Pip's family — Pip wears one too.
 * Four colours, picked by id so nobody is maintained by hand; more than four read like sweets.
 */
const KNIT = ['#B0603F', '#D9A441', '#3F7F86', '#8A4E6E'].map(
  (hex) => new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), ...FLAT }),
);
/** Nana's shawl: Pip's scarf red, so grandmother and grandchild match. */
const SHAWL = coat(PALETTE.PIP_SCARF);
const knitFor = (id: string): THREE.Material => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return KNIT[h % KNIT.length] as THREE.Material;
};

/**
 * A villager: upright body on visible legs or feet, a head on top, eyes, a beak or snout, a scarf,
 * and the species mark from npcSpecies.ts. Still primitives and flat shading — the reference gets
 * its charm from silhouette and colour, not polygons — but sized and stood up so it reads as
 * someone, not something, from chase distance.
 */
export function buildNpc(def: NpcDef): THREE.Object3D {
  const root = new THREE.Group();
  const figure = new THREE.Group();
  root.add(figure);
  const bird = isBird(def.species);
  const k: Kit = {
    root: figure,
    body: coat(def.body),
    accent: coat(def.accent),
    dark: lam(PALETTE.PIP_GLASS),
    part(geo, mat, p, sc, rx = 0, rz = 0) {
      const m = mesh(GEOS[geo], mat);
      m.position.set(p[0], p[1], p[2]);
      m.scale.set(sc[0], sc[1], sc[2]);
      m.rotation.set(rx, 0, rz);
      figure.add(m);
      return m;
    },
  };

  // Legs for birds, feet for everyone else: the cheapest "this stands up" cue, and rocks have none.
  for (const side of [-1, 1]) {
    if (bird) {
      k.part('cyl', lam(PALETTE.PIP_BEAK), [side * 0.11, 0.12, 0.02], [0.025, 0.26, 0.025]);
      k.part('sphere', lam(PALETTE.PIP_BEAK), [side * 0.11, 0.02, 0.07], [0.06, 0.025, 0.09]);
    } else {
      k.part('sphere', k.accent, [side * 0.14, 0.06, 0.1], [0.1, 0.07, 0.14]);
    }
  }

  if (bird) {
    k.part('sphere', k.body, [0, 0.62, 0], [0.42, 0.44, 0.4]);
    // Wings in the accent colour: a darker mass on each side, like Pip's own brown back.
    for (const side of [-1, 1]) k.part('sphere', k.accent, [side * 0.36, 0.66, -0.06], [0.1, 0.3, 0.3], 0, side * 0.15);
    k.part('sphere', k.body, [0, HEAD_Y, 0.02], [0.28, 0.28, 0.28]);
    // An owl's beak is its own, short and hooked down (npcSpecies.ts): a long straight one read as a snout.
    if (def.species !== 'owl') k.part('cone', lam(PALETTE.PIP_BEAK), [0, HEAD_Y - 0.04, 0.33], [0.07, 0.18, 0.07], Math.PI / 2);
  } else {
    k.part('sphere', k.body, [0, 0.62, 0], [0.36, 0.5, 0.32]);
    // A pale belly: the front-on read of almost every mammal here, and contrast for dark coats.
    k.part('sphere', k.accent, [0, 0.58, 0.14], [0.25, 0.36, 0.22]);
    k.part('sphere', k.body, [0, HEAD_Y, 0.02], [0.26, 0.25, 0.26]);
    k.part('cone', k.body, [0, HEAD_Y - 0.05, 0.3], [0.11, 0.22, 0.11], Math.PI / 2);
    k.part('sphere', k.dark, [0, HEAD_Y - 0.05, 0.41], [0.045, 0.04, 0.04]);
  }
  for (const side of [-1, 1]) k.part('sphere', k.dark, [side * 0.12, HEAD_Y + 0.06, 0.23], [0.045, 0.05, 0.04]);

  // The scarf, or for the ptarmigan (Nana) a red shawl round her shoulders, crossed and knotted
  // at the front with its ends hanging: she is white on white snow, so she wears the biggest block
  // of warm colour in the cast, and it has to read from the front, where conversations see her.
  const knit = knitFor(def.id);
  if (def.species === 'ptarmigan') {
    k.part('cone', SHAWL, [0, 0.84, -0.02], [0.6, 0.5, 0.54]);
    k.part('sphere', SHAWL, [0, 0.8, 0.34], [0.14, 0.12, 0.1]);
    for (const side of [-1, 1]) k.part('cyl', SHAWL, [side * 0.09, 0.56, 0.36], [0.06, 0.4, 0.04], 0.15, side * 0.2);
  } else {
    k.part('cyl', knit, [0, 0.95, 0.01], [0.3, 0.1, 0.28]);
    k.part('cyl', knit, [0.14, 0.78, 0.25], [0.06, 0.26, 0.03], 0.1);
  }

  SPECIES_MARKS[def.species]?.(k);

  figure.scale.setScalar((VILLAGER_HEIGHT / 1.48) * (SPECIES_SIZE[def.species] ?? 0.95));
  root.rotation.y = def.yaw;
  return root;
}

/**
 * Feathers are gold, bells are lantern-warm. Lantern posts are lanternPosts.ts.
 *
 * A feather was a 0.5 u quill, three pixels at twenty steps, and the critic found one in fourteen,
 * by accident. It is half as big again now and carries a soft gold glint, so one beside the trail is
 * seen from the trail.
 */
export function buildPickup(def: PickupDef): THREE.Object3D {
  const root = new THREE.Group();
  if (def.kind === 'feather') {
    const quill = glow(PALETTE.SUN_MID);
    const shaft = mesh(CONE, quill);
    shaft.scale.set(0.07, 0.5, 0.07);
    root.add(shaft);
    for (const side of [-1, 1]) {
      const vane = mesh(CONE, quill);
      vane.scale.set(0.05, 0.26, 0.05);
      vane.position.set(side * 0.07, 0.05, 0);
      vane.rotation.z = side * 0.5;
      root.add(vane);
    }
    root.scale.setScalar(1.5);
    root.add(haloSprite(PALETTE.SUN_MID, 1.3, 0.4));
    root.position.y = 1.0;
  } else {
    const b = mesh(SPHERE, glow(PALETTE.LANTERN));
    b.scale.set(0.12, 0.14, 0.12);
    root.add(b);
    root.position.y = 0.42;
  }
  return root;
}
