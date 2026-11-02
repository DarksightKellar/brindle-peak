/**
 * What makes each species read as itself at 384x216: one or two big shapes, not detail.
 *
 * The villagers used to be one egg, one ball and a snout at under a unit tall — smaller than Pip,
 * pale on pale snow, and from chase distance they read as rocks (playtest, Nana worst of all). The
 * read comes back from three things, in order: size (a grown-up is at least Pip's height), an
 * upright stance with legs or feet under it (rocks have neither), and one species mark big enough
 * to survive the pixel grid — a hare's ears, a fox's brush, an owl's tufts and face disc.
 *
 * Every part is placed in "body units": the head top sits at ~1.48, scaled to 1.6 world units. The
 * builder in npcBodies.ts scales the whole figure by the species size below.
 */

import * as THREE from 'three';

/** Overall size per species, relative to a standard villager. A mouse is small; nobody is tiny. */
export const SPECIES_SIZE: Readonly<Record<string, number>> = {
  'snow bunting': 0.9,
  ptarmigan: 1.02,
  hare: 1.0,
  fox: 1.05,
  otter: 0.92,
  raven: 1.0,
  'red squirrel': 0.95,
  owl: 1.08,
  'deer mouse': 0.78,
  marten: 0.92,
};

const BIRDS = new Set(['snow bunting', 'ptarmigan', 'owl', 'raven']);
export const isBird = (species: string): boolean => BIRDS.has(species);

/** The shared parts every builder draws with, so a species function stays a few lines long. */
export interface Kit {
  root: THREE.Group;
  body: THREE.Material;
  accent: THREE.Material;
  dark: THREE.Material;
  /** Add a primitive at body-unit position/scale, optional rotation (x, z). */
  part(geo: 'sphere' | 'cone' | 'cyl', mat: THREE.Material, p: [number, number, number], s: [number, number, number], rx?: number, rz?: number): THREE.Mesh;
}

/** The ptarmigan's red comb: Pip's scarf red, the one red that already belongs to the family. */
const COMB = new THREE.MeshLambertMaterial({ color: new THREE.Color('#C4574C'), flatShading: true });

/** Head centre in body units; species marks are placed relative to it. */
export const HEAD_Y = 1.18;

function ears(k: Kit, height: number, width: number, splay: number, mat: THREE.Material): void {
  for (const side of [-1, 1]) {
    const ear = k.part('cone', mat, [side * 0.13, HEAD_Y + 0.18 + height / 2, -0.02], [width, height, width * 0.7]);
    ear.rotation.z = side * -splay;
  }
}

/** A tail as one cone pointing up and back from the rump. */
function tail(k: Kit, mat: THREE.Material, len: number, girth: number, tilt: number, y = 0.42): THREE.Mesh {
  return k.part('cone', mat, [0, y + Math.cos(tilt) * len * 0.35, -0.38 - Math.sin(tilt) * len * 0.35], [girth, len, girth], -tilt);
}

/** Species marks. Anything not listed gets only the shared body, head, snout or beak. */
export const SPECIES_MARKS: Readonly<Record<string, (k: Kit) => void>> = {
  hare: (k) => {
    // The longest ears in the valley, tipped dark: the one hare shape that survives any distance.
    ears(k, 0.66, 0.1, 0.16, k.body);
    for (const side of [-1, 1]) k.part('sphere', k.dark, [side * 0.18, HEAD_Y + 0.84, -0.02], [0.06, 0.1, 0.06]);
    // Haunches and long hind feet: a hare sits on its back legs, which is what stops it reading as a
    // post with a head on it.
    k.part('sphere', k.body, [0, 0.4, -0.2], [0.42, 0.36, 0.42]);
    for (const side of [-1, 1]) k.part('sphere', k.accent, [side * 0.2, 0.05, 0.08], [0.1, 0.06, 0.3]);
    k.part('sphere', k.accent, [0, 0.42, -0.6], [0.15, 0.15, 0.13]);
  },
  fox: (k) => {
    ears(k, 0.26, 0.11, 0.25, k.body);
    // A big brush with a white tip, curled low behind: the fox silhouette is half tail.
    tail(k, k.body, 0.85, 0.2, 1.15, 0.3);
    k.part('sphere', k.accent, [0, 0.42, -0.95], [0.14, 0.12, 0.16]);
  },
  'red squirrel': (k) => {
    // Winter ear tufts: tall, dark-tipped, the red squirrel's own mark.
    ears(k, 0.3, 0.07, 0.12, k.body);
    for (const side of [-1, 1]) k.part('cone', k.dark, [side * 0.16, HEAD_Y + 0.62, -0.02], [0.05, 0.16, 0.05], 0, side * -0.12);
    // The tail is the squirrel: a big plume rising from the rump up the back, curling at the top, so
    // the silhouette is a question mark rather than a bean. It was the body's own colour and as wide,
    // and its curl stood above the head like a second one: from behind, Gus read as two squirrels
    // (critic 3). Now a shade darker than the coat, narrower, and curling back, not over the head.
    const plume = (k.body as THREE.MeshLambertMaterial).clone();
    plume.color.multiplyScalar(0.72);
    plume.emissive.multiplyScalar(0.72);
    k.part('sphere', plume, [0, 0.45, -0.5], [0.2, 0.24, 0.22]);
    k.part('sphere', plume, [0, 0.88, -0.62], [0.22, 0.34, 0.25], -0.2);
    k.part('sphere', plume, [0, 1.3, -0.66], [0.22, 0.26, 0.24]);
    k.part('sphere', plume, [0, 1.48, -0.86], [0.17, 0.15, 0.2]);
    k.part('sphere', k.accent, [0, 0.62, 0.2], [0.2, 0.3, 0.12]);
  },
  marten: (k) => {
    ears(k, 0.14, 0.09, 0.3, k.body);
    k.part('sphere', k.accent, [0, 0.88, 0.22], [0.2, 0.16, 0.1]);
    tail(k, k.body, 0.7, 0.12, 1.25, 0.25);
  },
  otter: (k) => {
    for (const side of [-1, 1]) k.part('sphere', k.body, [side * 0.2, HEAD_Y + 0.17, -0.02], [0.06, 0.06, 0.05]);
    tail(k, k.body, 0.75, 0.13, 1.4, 0.18);
  },
  'deer mouse': (k) => {
    // Round dish ears, wider than the head: a mouse at four pixels is two circles and a body.
    for (const side of [-1, 1]) k.part('sphere', k.accent, [side * 0.24, HEAD_Y + 0.24, -0.02], [0.17, 0.17, 0.05]);
    tail(k, k.accent, 0.8, 0.04, 1.45, 0.2);
  },
  owl: (k) => {
    // Face disc, big eyes on it, and ear tufts. The disc is the accent colour, so the face reads
    // before the body; the shared eyes sit behind the disc, so an owl draws its own, larger ones.
    k.part('sphere', k.accent, [0, HEAD_Y, 0.2], [0.27, 0.25, 0.1]);
    for (const side of [-1, 1]) k.part('sphere', k.dark, [side * 0.11, HEAD_Y + 0.04, 0.29], [0.065, 0.065, 0.03]);
    ears(k, 0.22, 0.08, 0.35, k.body);
  },
  ptarmigan: (k) => {
    // Winter ptarmigan: white, with a black tail fan and a red comb over the eye.
    k.part('sphere', k.dark, [0, 0.5, -0.46], [0.3, 0.1, 0.28], -0.55);
    for (const side of [-1, 1]) k.part('sphere', COMB, [side * 0.13, HEAD_Y + 0.12, 0.15], [0.07, 0.045, 0.08]);
  },
  raven: (k) => {
    // Long wedge tail and a heavy beak; the body is dark, so the accent goes on the wings.
    k.part('cone', k.body, [0, 0.4, -0.5], [0.14, 0.6, 0.08], -1.2);
  },
  'snow bunting': (k) => {
    // Pip's own species: same warm back as Pip, so a cousin reads as family.
    k.part('sphere', k.accent, [0, 0.72, -0.12], [0.4, 0.34, 0.36]);
  },
};

