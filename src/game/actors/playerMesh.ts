/**
 * Pip, built from primitives — a snow bunting at ~232 triangles (ART_BIBLE §7 budget 260).
 *
 * READABILITY (ART_BIBLE A5): cream Pip on cream snow is invisible at 384×216, so the back,
 * wing coverts and tail carry `PIP_WING` warm brown, and a persistent dark contact ellipse
 * rides under the feet at 45 % alpha. The ellipse is a decal, not a shadow: it never turns
 * off, never fades with height, and is excluded from the normal-override pass (A3) so it
 * cannot inject depth edges into the outline.
 *
 * All animation is derived from `PlayerState` (velocity, mode, grounded) plus a local clock.
 * Nothing is written back into the state, and no field is added to it.
 */

import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { TUNING } from '../../core/player/tuning';
import type { PlayerState } from '../../core/contracts';
import { buildLantern } from './pipLantern';

export interface PlayerMesh {
  root: THREE.Object3D;
  /** `lantern`: Pip is carrying Nana's lantern (state.abilities.lantern), so it hangs at the side. */
  sync(s: PlayerState, dt: number, lantern?: boolean): void;
}

const FLAT = { flatShading: true } as const;

const lambert = (hex: string): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), ...FLAT });

const shade = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
};

export function createPlayerMesh(): PlayerMesh {
  const cream = lambert(PALETTE.PIP_BODY);
  const brown = lambert(PALETTE.PIP_WING);
  const dark = lambert(PALETTE.PIP_BEAK);
  const red = lambert(PALETTE.PIP_SCARF);
  const glass = lambert(PALETTE.PIP_GLASS);

  const root = new THREE.Object3D();
  const rig = new THREE.Group(); // bird scale: 1 = the primitive sizes above
  rig.scale.setScalar(1.4);
  const body = new THREE.Group(); // squash, lean and bob live here; the decal stays flat
  rig.add(body);
  root.add(rig);

  const torso = shade(new THREE.IcosahedronGeometry(0.4, 0), cream);
  torso.scale.set(1, 0.92, 1.2); // PIP_BODY front
  body.add(torso);

  const back = shade(new THREE.IcosahedronGeometry(0.33, 0), brown, 0, 0.12, -0.14);
  back.scale.set(1.02, 0.72, 1.0); // PIP_WING mantle over the back
  body.add(back);

  const head = shade(new THREE.IcosahedronGeometry(0.26, 0), cream, 0, 0.36, 0.26);
  body.add(head);

  const beak = shade(new THREE.ConeGeometry(0.07, 0.2, 4), dark, 0, 0.33, 0.52);
  beak.rotation.x = Math.PI / 2;
  body.add(beak);

  const tail = shade(new THREE.IcosahedronGeometry(0.16, 0), brown, 0, 0.06, -0.5);
  tail.scale.set(0.7, 0.32, 1.5);
  tail.rotation.x = -0.18;
  body.add(tail);

  const wingGeo = new THREE.IcosahedronGeometry(0.2, 0);
  const wingL = shade(wingGeo, brown, -0.34, 0.16, -0.02);
  const wingR = shade(wingGeo, brown, 0.34, 0.16, -0.02);
  wingL.scale.set(1.5, 0.22, 1.0);
  wingR.scale.set(1.5, 0.22, 1.0);
  body.add(wingL, wingR);

  const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.16, 4, 1, true);
  const legL = shade(legGeo, dark, -0.1, -0.38, 0.04);
  const legR = shade(legGeo, dark, 0.1, -0.38, 0.04);
  body.add(legL, legR);

  const scarf = shade(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8, 1, true), red, 0, 0.24, 0.1);
  body.add(scarf);
  const scarfEnd = shade(new THREE.BoxGeometry(0.09, 0.24, 0.05), red, 0.16, 0.06, 0.06);
  scarfEnd.rotation.z = 0.25;
  body.add(scarfEnd);

  // Hangs at the left side, out past the wing so the chase camera sees it, swinging with the step.
  const lantern = buildLantern();
  lantern.position.set(0.44, -0.04, -0.06);
  lantern.scale.setScalar(1.35);
  lantern.visible = false;
  body.add(lantern);

  const ringGeo = new THREE.TorusGeometry(0.06, 0.014, 3, 5);
  const lensL = shade(ringGeo, glass, -0.1, 0.38, 0.44);
  const lensR = shade(ringGeo, glass, 0.1, 0.38, 0.44);
  body.add(lensL, lensR);

  // A5 contact ellipse. Dark, constant, never depth-writing, never in the normal pass.
  const contactMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.SHADOW_FLOOR),
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  });
  contactMat.allowOverride = false;
  const contact = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.012;
  contact.renderOrder = 1;
  root.add(contact);

  // Legs hang to y = -0.46 in body space; lift the body so the feet land on y = 0 in world
  // space at rig scale 1.4, giving ~1.5 u of bird for the GDD's 1.6 u character.
  const FOOT = 0.46;
  body.position.y = FOOT;

  let clock = 0;
  let squash = 0;
  let flare = 0;
  let lean = 0;
  let prevGrounded = true;
  let prevVy = 0;

  const sync = (s: PlayerState, dt: number, carrying = false): void => {
    clock += dt;
    lantern.visible = carrying;
    root.position.set(s.pos.x, s.pos.y, s.pos.z);
    root.rotation.y = s.facing; // model faces +Z, so yaw needs no correction

    const speed = Math.hypot(s.vel.x, s.vel.z);
    const fast = Math.min(1, speed / TUNING.walkSpeed);

    if (s.grounded && !prevGrounded && prevVy < -2) squash = 1;
    prevGrounded = s.grounded;
    prevVy = s.vel.y;
    squash = Math.max(0, squash - dt / 0.18);

    const k = squash * squash;
    body.scale.set(1 + k * 0.22, 1 - k * 0.3, 1 + k * 0.22);

    const bob = s.grounded ? Math.sin(clock * 11 * (0.7 + fast)) * 0.035 * fast : 0;
    legL.position.y = -0.38 + bob;
    legR.position.y = -0.38 - bob;
    body.position.y = FOOT + bob * 0.5;

    const wantFlare = s.mode === 'glide' ? 1 : s.mode === 'climb' ? 0.55 : 0;
    flare += (wantFlare - flare) * Math.min(1, dt * 8);
    wingL.rotation.z = -flare * 0.9;
    wingR.rotation.z = flare * 0.9;
    wingL.rotation.y = -flare * 0.3;
    wingR.rotation.y = flare * 0.3;

    const wantLean = s.mode === 'climb' ? -0.4 : s.mode === 'glide' ? 0.18 : s.mode === 'sled' ? -0.14 : 0;
    lean += (wantLean - lean) * Math.min(1, dt * 6);
    body.rotation.x = lean;

    contact.scale.setScalar(1 + Math.min(0.35, speed * 0.03));
    // The lantern swings on its bail: forward against the stride, out a little in the air.
    lantern.rotation.x = -lean * 0.8 + bob * 4;
    lantern.rotation.z = flare * 0.35;
  };

  return { root, sync };
}
