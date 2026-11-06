/**
 * A warm light at Pip's side after dark.
 *
 * Critic round 5: from the blue hour on, the bird you play was the lowest-contrast thing on screen, a
 * blue-white ball in blue snow, and a snowball rolled in front of it took twenty seconds to find. Nana's
 * lantern already hangs at Pip's side and glows; now it lights what is round it too: Pip's own breast,
 * the snow under its feet, a ball being pushed. By day it is off. Without the lantern (a run that is
 * still on Bram's errand at dusk cannot happen, but a hand-made save can) there is a fainter glow.
 */

import * as THREE from 'three';
import type { Vec3 } from '../../core/contracts';
import { PALETTE } from '../../core/palette';

/** Candela at full dusk, carrying the lantern and not. */
const LIT = 2.6;
const BARE = 1.2;
/** How far the light reaches, units. */
const REACH = 7;
/** Over Pip's head, units: high enough that no feather is a hand's breadth from the bulb. */
const GLOW_HEIGHT = 2.2;

export interface PipGlow {
  update(pos: Vec3, dusk: number, carrying: boolean): void;
}

export function createPipGlow(scene: THREE.Object3D): PipGlow {
  const light = new THREE.PointLight(new THREE.Color(PALETTE.LANTERN), 0, REACH, 1);
  light.castShadow = false;
  light.name = 'pip-glow';
  scene.add(light);
  return {
    update(pos, dusk, carrying): void {
      light.intensity = (carrying ? LIT : BARE) * dusk;
      light.visible = dusk > 0.02;
      // Over Pip's head, not at its chest: 0.4 u off the breast the light burnt a white-orange blob into
      // the feathers, and critic round 59 took the bird to be on fire. From above it pools on the snow
      // round Pip's feet and warms the bird evenly; the lantern's own glow says where the light is from.
      light.position.set(pos.x, pos.y + GLOW_HEIGHT, pos.z);
    },
  };
}
