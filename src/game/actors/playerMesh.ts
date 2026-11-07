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
import { sprintAmount, strideRate, walkAmount } from '../../core/player/stride';
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

/**
 * Pip's own colours keep a floor of themselves in shade. Under the blue sky fill alone the cream bird
 * went grey-blue, and critic round 68 read it as a silhouette rather than the cream bird on the cover:
 * a little of each colour glows back, so a shaded Pip is darker cream, not grey.
 */
const SHADE_FLOOR = 0.24;
const feather = (hex: string, floor = SHADE_FLOOR): THREE.MeshLambertMaterial => {
  const m = lambert(hex);
  m.emissive = new THREE.Color(hex).multiplyScalar(floor);
  return m;
};

const shade = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
};

/**
 * `groundAt` is the snow's height under a point: the contact shadow stays on it while Pip is in the air.
 * Parented to the bird alone, it jumped with the bird (the director, round 47).
 */
export function createPlayerMesh(groundAt?: (x: number, z: number) => number): PlayerMesh {
  const cream = feather(PALETTE.PIP_BODY);
  const brown = feather(PALETTE.PIP_WING);
  const dark = lambert(PALETTE.PIP_BEAK);
  // A snow bunting's winter bill is straw-yellow: the one warm point on the face, so it reads as a bird.
  const bill = lambert(PALETTE.AMBER);
  const red = feather(PALETTE.PIP_SCARF);
  const glass = lambert(PALETTE.PIP_GLASS);

  const root = new THREE.Object3D();
  const rig = new THREE.Group(); // bird scale: 1 = the primitive sizes above
  rig.scale.setScalar(1.4);
  const body = new THREE.Group(); // squash, lean and bob live here; the decal stays flat
  rig.add(body);
  root.add(rig);

  // One subdivision on the body and head: at detail 0 the critic read Pip as "a faceted white blob".
  const torso = shade(new THREE.IcosahedronGeometry(0.4, 1), cream);
  torso.scale.set(1, 0.92, 1.2); // PIP_BODY front
  body.add(torso);

  const back = shade(new THREE.IcosahedronGeometry(0.33, 0), brown, 0, 0.12, -0.14);
  back.scale.set(1.02, 0.72, 1.0); // PIP_WING mantle over the back
  body.add(back);

  const head = shade(new THREE.IcosahedronGeometry(0.27, 1), cream, 0, 0.38, 0.26);
  body.add(head);

  const beak = shade(new THREE.ConeGeometry(0.075, 0.22, 4), bill, 0, 0.34, 0.54);
  beak.rotation.x = Math.PI / 2;
  body.add(beak);

  const tail = shade(new THREE.IcosahedronGeometry(0.16, 0), brown, 0, 0.06, -0.5);
  tail.scale.set(0.7, 0.32, 1.5);
  tail.rotation.x = -0.18;
  body.add(tail);

  // Each wing hangs from a shoulder pivot, so it folds down against the side at rest and opens out
  // flat to glide. Rotated about its own middle (before), the resting wing stuck straight out and Pip
  // looked mid-glide all the time, and the glide tipped the wings up into a V.
  const wingGeo = new THREE.IcosahedronGeometry(0.2, 0);
  const shoulderL = new THREE.Group();
  const shoulderR = new THREE.Group();
  shoulderL.position.set(-0.2, 0.16, -0.02);
  shoulderR.position.set(0.2, 0.16, -0.02);
  const wingL = shade(wingGeo, brown, -0.14, 0, 0);
  const wingR = shade(wingGeo, brown, 0.14, 0, 0);
  wingL.scale.set(1.5, 0.22, 1.0);
  wingR.scale.set(1.5, 0.22, 1.0);
  shoulderL.add(wingL);
  shoulderR.add(wingR);
  body.add(shoulderL, shoulderR);
  /** Shoulder angle at rest (tips down along the side) and in a glide (out flat, a hair of lift). */
  const WING_REST = 0.62;
  const WING_OPEN = -0.05;

  const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.16, 4, 1, true);
  const legL = shade(legGeo, dark, -0.1, -0.38, 0.04);
  const legR = shade(legGeo, dark, 0.1, -0.38, 0.04);
  body.add(legL, legR);

  // The scarf is Pip's colour accent against the snow: thick enough to read from the chase camera.
  const scarf = shade(new THREE.CylinderGeometry(0.22, 0.24, 0.14, 8, 1, true), red, 0, 0.24, 0.1);
  body.add(scarf);
  const scarfEnd = shade(new THREE.BoxGeometry(0.11, 0.3, 0.05), red, 0.17, 0.04, -0.04);
  scarfEnd.rotation.z = 0.25;
  body.add(scarfEnd);

  // Hangs at the left side, out past the wing so the chase camera sees it, swinging with the step.
  const lantern = buildLantern();
  lantern.position.set(0.44, -0.04, -0.06);
  lantern.scale.setScalar(1.35);
  lantern.visible = false;
  body.add(lantern);

  const ringGeo = new THREE.TorusGeometry(0.06, 0.014, 3, 5);
  // On the face's surface: inside the head, as they were, the spectacles barely showed.
  const lensL = shade(ringGeo, glass, -0.12, 0.43, 0.5);
  const lensR = shade(ringGeo, glass, 0.12, 0.43, 0.5);
  lensL.rotation.y = -0.4;
  lensR.rotation.y = 0.4;
  // A dark eye behind each lens: the rings alone read as nothing at play distance.
  const eyeGeo = new THREE.OctahedronGeometry(0.045, 0);
  const eyeL = shade(eyeGeo, glass, -0.12, 0.43, 0.48);
  const eyeR = shade(eyeGeo, glass, 0.12, 0.43, 0.48);
  body.add(lensL, lensR, eyeL, eyeR);

  // A5 contact ellipse. Dark, never depth-writing, never in the normal pass.
  const CONTACT_OPACITY = 0.45;
  /** Just above the snow, so it never fights the ground. */
  const CONTACT_LIFT = 0.012;
  /** Where the feet rest above the sampled snow (core/player/step.ts GROUND_OFFSET). */
  const FEET_ABOVE_SNOW = 0.02;
  /** Units above the snow at which the shadow is at its smallest and faintest. */
  const CONTACT_FADE = 8;
  const contactMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.SHADOW_FLOOR),
    transparent: true,
    opacity: CONTACT_OPACITY,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  });
  contactMat.allowOverride = false;
  const contact = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = CONTACT_LIFT;
  contact.renderOrder = 1;
  contact.name = 'contact-shadow';
  root.add(contact);

  // Legs hang to y = -0.46 in body space; lift the body so the feet land on y = 0 in world
  // space at rig scale 1.4, giving ~1.5 u of bird for the GDD's 1.6 u character.
  const FOOT = 0.46;
  body.position.y = FOOT;

  /** One flap's wingbeat, seconds; the first third is the downstroke. */
  const FLAP = 0.34;
  const DOWNSTROKE = 0.34;
  /** How fast the take-off stretch relaxes, seconds. */
  const STRETCH = 0.16;
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));

  let clock = 0;
  let stridePhase = 0;
  let squash = 0;
  let stretch = 0;
  let flap = 0;
  let flare = 0;
  let lean = 0;
  let prevGrounded = true;
  let prevVy = 0;
  let prevFlaps = 0;

  const sync = (s: PlayerState, dt: number, carrying = false): void => {
    clock += dt;
    lantern.visible = carrying;
    root.position.set(s.pos.x, s.pos.y, s.pos.z);
    root.rotation.y = s.facing; // model faces +Z, so yaw needs no correction

    const speed = Math.hypot(s.vel.x, s.vel.z);
    const fast = walkAmount(speed, TUNING);
    // 0 at a brisk walk, 1 at full sprint: the run tucks the wings and leans into it.
    const sprint = sprintAmount(speed, s.grounded, TUNING);
    // The legs' phase is integrated, so a change of pace changes the rate without the legs jumping.
    stridePhase = (stridePhase + dt * strideRate(speed, s.grounded, TUNING)) % (Math.PI * 2);
    const tookOff = prevGrounded && !s.grounded;

    if (s.grounded && !prevGrounded && prevVy < -2) squash = 1;
    if (tookOff) stretch = 1;
    if (s.flapsUsed > prevFlaps) flap = FLAP;
    prevFlaps = s.flapsUsed;
    prevGrounded = s.grounded;
    prevVy = s.vel.y;
    squash = Math.max(0, squash - dt / 0.18);
    stretch = Math.max(0, stretch - dt / STRETCH);
    flap = Math.max(0, flap - dt);

    // Landing squashes, taking off stretches tall and thin.
    const k = squash * squash;
    const st = stretch * stretch;
    body.scale.set(1 + k * 0.22 - st * 0.12, 1 - k * 0.3 + st * 0.3, 1 + k * 0.22 - st * 0.12);

    const stride = 0.035 * (fast + sprint * 0.9);
    const bob = s.grounded ? Math.sin(stridePhase) * stride : 0;
    const air = s.grounded ? 0 : 1;
    // In the air the feet tuck up and back.
    legL.position.y = -0.38 + bob + air * 0.12;
    legR.position.y = -0.38 - bob + air * 0.12;
    legL.position.z = -0.12 * sprint - air * 0.1;
    legR.position.z = -0.12 * sprint - air * 0.1;

    // A flap is a visible wingbeat: down hard, then back up past rest, with a little lift.
    const phase = flap > 0 ? 1 - flap / FLAP : 1;
    const beat = flap > 0
      ? phase < DOWNSTROKE ? lerp(0.75, -0.95, phase / DOWNSTROKE) : lerp(-0.95, 0.3, (phase - DOWNSTROKE) / (1 - DOWNSTROKE))
      : 0;
    const lift = flap > 0 ? Math.sin(Math.PI * Math.min(1, phase)) * 0.06 : 0;
    body.position.y = FOOT + bob * 0.5 + lift;

    const wantFlare = s.mode === 'glide' ? 1 : s.mode === 'climb' ? 0.55 : s.grounded ? 0 : 0.85;
    flare += (wantFlare - flare) * Math.min(1, dt * 8);
    // Positive is tip down on the left. Rest folds down, a glide opens out flat; a sprint tucks a
    // little further and the wingbeat swings through both.
    const wing = lerp(WING_REST, WING_OPEN, flare) + sprint * 0.2 - beat;
    shoulderL.rotation.z = wing;
    shoulderR.rotation.z = -wing;
    shoulderL.rotation.y = -flare * 0.3 + sprint * 0.5;
    shoulderR.rotation.y = flare * 0.3 - sprint * 0.5;

    const wantLean = s.grounded
      ? s.mode === 'climb' ? -0.4 : s.mode === 'glide' ? 0.18 : s.mode === 'sled' ? -0.14 : sprint * 0.3
      : s.vel.y > 0.5 ? -0.2 : 0.26;
    lean += (wantLean - lean) * Math.min(1, dt * (s.grounded ? 6 : 14));
    body.rotation.x = lean;

    // On the snow under Pip, not under its feet: in the air it stays down, smaller and fainter with height.
    const up = groundAt ? Math.max(0, s.pos.y - groundAt(s.pos.x, s.pos.z) - FEET_ABOVE_SNOW) : 0;
    contact.position.y = CONTACT_LIFT - up;
    const far = Math.min(1, up / CONTACT_FADE);
    contact.scale.setScalar((1 + Math.min(0.35, speed * 0.03)) * (1 - far * 0.5));
    contactMat.opacity = CONTACT_OPACITY * (1 - far * 0.6);
    // The lantern swings on its bail: forward against the stride, out a little in the air.
    lantern.rotation.x = -lean * 0.8 + bob * 4;
    lantern.rotation.z = flare * 0.35;
  };

  return { root, sync };
}
