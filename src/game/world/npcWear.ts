/**
 * Clothes that say who someone is, for villagers who share a species with someone else.
 *
 * Two red squirrels (Bram and Gus) and two ravens (Margit and Corm) were the same figure in a shade of
 * a different coat, and the critic took one for the other (round 71). The scarf colour alone does not
 * carry at a distance or at dusk. One worn thing, tied to what the person does, does: the shopkeeper
 * in an apron with a bell, the valley's news-bringer in a flat cap.
 *
 * Listed per villager in data/npcs.ts (`wear`); a villager with none wears only the scarf.
 * Parts are placed in the same body units as npcSpecies.ts.
 */

import * as THREE from 'three';
import type { NpcWear } from '../../core/contracts';
import { HEAD_Y, type Kit } from './npcSpecies';

const cloth = (hex: string, selfLight = 0.2): THREE.MeshLambertMaterial => {
  const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), flatShading: true });
  m.emissive.copy(m.color).multiplyScalar(selfLight);
  return m;
};

/** A shop apron's deep green: the opposite of a red squirrel's coat, so it reads at any distance. */
const APRON = cloth('#3E6650');
/** Brass, a little self-lit so it catches the eye the way a bell does. */
const BRASS = cloth('#E0B04A', 0.35);
/** A warm brown tweed: a black raven's head needs a light shape on it to show at dusk. */
const TWEED = cloth('#9A7B55');
const TWEED_DARK = cloth('#6E573C');

export const WEAR: Readonly<Record<NpcWear, (k: Kit) => void>> = {
  apron: (k) => {
    // A bib and a skirt over the pale belly, so the front reads green, not cream.
    k.part('sphere', APRON, [0, 0.46, 0.25], [0.33, 0.28, 0.12]);
    k.part('sphere', APRON, [0, 0.76, 0.28], [0.2, 0.14, 0.07]);
    // A pocket, a shade darker, so the panel reads as cloth rather than a second belly.
    k.part('sphere', TWEED_DARK, [0, 0.4, 0.36], [0.15, 0.06, 0.03]);
  },
  'neck-bell': (k) => {
    // A shop bell on a cord, hung on the apron bib where it shows against the green.
    // Big for a bell: at 384x216 it has to be several pixels across to read as one.
    k.part('cyl', TWEED_DARK, [0, 0.86, 0.33], [0.015, 0.1, 0.015]);
    k.part('cone', BRASS, [0, 0.72, 0.37], [0.14, 0.17, 0.14]);
    k.part('sphere', BRASS, [0, 0.63, 0.37], [0.1, 0.04, 0.1]);
  },
  'flat-cap': (k) => {
    // A newsboy's flat cap: a wide, low crown set at an angle, with a short peak over the beak.
    k.part('cyl', TWEED, [0.02, HEAD_Y + 0.22, -0.02], [0.3, 0.1, 0.3], 0, -0.14);
    k.part('sphere', TWEED, [0.02, HEAD_Y + 0.27, -0.03], [0.29, 0.07, 0.29], 0, -0.14);
    k.part('sphere', TWEED_DARK, [0, HEAD_Y + 0.18, 0.24], [0.2, 0.035, 0.13], 0.12);
    k.part('sphere', TWEED_DARK, [0.03, HEAD_Y + 0.33, -0.02], [0.05, 0.03, 0.05]);
  },
};
