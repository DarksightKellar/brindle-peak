/**
 * Pip's lantern (playerMesh.ts), split out to keep the bird under the file budget.
 */

import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { haloSprite } from '../world/halo';

/**
 * Nana's lantern, hung at Pip's side where the chase camera sees it. Edda says
 * "I'd know that lantern anywhere", and Nana hands it over in so many words; it used to exist only in
 * those words. A dark iron frame round a lit core that holds its colour by day and glows at dusk.
 */
export function buildLantern(): THREE.Group {
  const iron = new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE.ROCK_DK), flatShading: true });
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.LANTERN) });
  lit.allowOverride = false;
  const lantern = new THREE.Group();
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 3, 6, Math.PI), iron);
  bail.position.y = -0.02;
  lantern.add(bail);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.07, 4), iron);
  cap.position.y = -0.06;
  cap.rotation.y = Math.PI / 4;
  lantern.add(cap);
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.11), lit);
  core.position.y = -0.165;
  lantern.add(core);
  for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.15, 0.018), iron);
    bar.position.set(x * 0.062, -0.165, z * 0.062);
    lantern.add(bar);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.14), iron);
  base.position.y = -0.245;
  lantern.add(base);
  const glow = haloSprite(PALETTE.LANTERN, 0.7, 0.45);
  glow.position.y = -0.165;
  lantern.add(glow);
  return lantern;
}
