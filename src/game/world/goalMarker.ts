/**
 * The goal, marked in the world: a small lantern-coloured gem turning over the goal, and from further
 * off a column of lantern light rising out of it, so the way is readable from across the valley and
 * over the pines, not only on the HUD strip.
 *
 * Critic round 2 could not tell where to go: the HUD had a dot on a bar, and nothing in the world said
 * "there". This draws the same point the compass diamond points at (hud.ts `target()`), inside the
 * pixel layer, so it is chunky like everything else rather than a crisp HUD sprite pasted on top.
 *
 * Its size is set in screen pixels, not world units: a 7 px gem and a 3 px-wide, 44 px-tall column at
 * any distance (of the 216-pixel-high frame). Far off, the gem rides the top of the column; walking in,
 * the column fades out (inside ~30 u) and the gem slides down to sit over the target, then fades
 * inside ~5 u, where the E pill over the target takes over. Past the camera's far plane the whole
 * marker is drawn nearer along the same line of sight, so it still points the right way.
 *
 * The column is beauty-only (kept out of the normal pass, like the aurora) so it draws no outline; the
 * gem is solid and gets the same outline as any prop. Reduce motion stops the turn and the bob.
 *
 * The tracked errand gets a second, lesser marker (`SIDE_LOOK`): a smaller amber gem on a shorter,
 * fainter column, the world's copy of the dimmer diamond under the compass strip. The warm pool, Ivy
 * and Gus's bell were found by trial and error when only the story had a mark.
 */

import * as THREE from 'three';
import type { TerrainSampler, Vec2, Vec3 } from '../../core/contracts';
import { PALETTE } from '../../core/palette';
import { AURORA_LAYER } from '../render/aurora';
import { CAMERA } from '../render/pixelConfig';
import { groundHeightAt } from './groundHeight';

export interface GoalMarker {
  object: THREE.Object3D;
  /**
   * `show` false hides it (a conversation, a panel or an activity owns the screen). `arrowOk` false keeps
   * its arrow off the snow while the other marker's arrow is down.
   */
  update(dt: number, target: Vec2 | null, from: Vec3, camera: THREE.Camera, show: boolean, arrowOk?: boolean): void;
  /** True while its arrow lies on the snow this frame. */
  readonly arrowShown: boolean;
}

/** Internal render height in pixels (ART_BIBLE §1). */
const INTERNAL_H = 216;
/** World units per internal pixel, per unit of distance from the camera. */
const PX_PER_UNIT = (2 * Math.tan(((CAMERA.fov / 2) * Math.PI) / 180)) / INTERNAL_H;
/** Inside this many units of the far plane things are clipped; the marker is drawn no further. */
const DRAW_LIMIT = CAMERA.far * 0.8;
/** Above the target's ground: just over a villager's head (Nana and Bram stand about 1.5 u). */
const LIFT = 2.3;
/** How a marker looks: the story's, or the tracked errand's lesser one. */
export interface MarkerLook {
  /** The column's height on screen, in internal pixels (of 216). */
  beamPx: number;
  /** The gem's half-height in internal pixels. */
  gemPx: number;
  /** The column's strongest opacity. */
  beamAlpha: number;
  gem: string;
  glow: string;
  /** Lay an arrow on the snow by Pip, toward a goal that is close but out of view. */
  arrow?: boolean;
}
export const GOAL_LOOK: MarkerLook = { beamPx: 44, gemPx: 3.5, beamAlpha: 1, gem: PALETTE.LANTERN, glow: PALETTE.AMBER, arrow: true };

/**
 * The arrow on the snow: within ARROW_FAR of the goal and outside ARROW_NEAR, while the goal lies more
 * than ARROW_OFF radians off the way the view looks. Critic round 79 stood 9 u from Edda with "9 u,
 * behind you, to your right" and nothing on screen, and walked round her for fifteen presses.
 */
// 45 since critic round 95, which circled goals 35 u off, out of view, for many presses.
const ARROW_FAR = 45;
const ARROW_NEAR = 4;
const ARROW_OFF = 0.6;
/** How far out from Pip the arrow lies, and its length. */
const ARROW_OUT = 2.3;
/** The arrow's size, swelling a little so it catches the eye: critic round 80 found it easy to miss. */
const ARROW_SIZE = 1.5;

/** A flat arrow, nose along +Z, lying in the XZ plane. */
function floorArrow(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.75);
  s.lineTo(0.5, 0.1);
  s.lineTo(0.18, 0.1);
  s.lineTo(0.18, -0.55);
  s.lineTo(-0.18, -0.55);
  s.lineTo(-0.18, 0.1);
  s.lineTo(-0.5, 0.1);
  s.closePath();
  // Shape space is XY; lying it down puts +Y along -Z, so turn it round to point along +Z.
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2).rotateY(Math.PI);
}
// The errand's arrow too, in its own amber, when the goal's is not down: critic round 95 walked round
// Corm, the dam and Ivy, all errands on the line, for "35 u, behind you" with no arrow on the snow.
export const SIDE_LOOK: MarkerLook = { beamPx: 24, gemPx: 2.5, beamAlpha: 0.55, gem: PALETTE.AMBER, glow: PALETTE.AMBER, arrow: true };

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The column's look: a pale warm core between lantern edges, fading and dithering out toward the top. */
function beamTexture(): THREE.DataTexture {
  const w = 3, h = 48;
  const data = new Uint8Array(w * h * 4);
  const core = new THREE.Color(PALETTE.SUN_HI), edge = new THREE.Color(PALETTE.LANTERN);
  for (let y = 0; y < h; y++) {
    const up = y / (h - 1); // 0 at the base, 1 at the top
    for (let x = 0; x < w; x++) {
      const c = x === 0 || x === w - 1 ? edge : core;
      // Upper half: every other texel, the low-res way of fading out.
      const gap = up > 0.55 && (x + y) % 2 === 1;
      const a = gap ? 0 : Math.round(255 * 0.9 * (1 - up) ** 0.8);
      data.set([c.r * 255, c.g * 255, c.b * 255, a], (y * w + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** What `mountGoalMarker` hooks into: the HUD reports its target once a frame, after the camera moved. */
export interface GoalMarkerDeps {
  scene: THREE.Object3D;
  sampler: TerrainSampler;
  camera: THREE.Camera;
  hud: { onFrame(fn: (target: Vec2 | null, from: Vec3, held: boolean, side: Vec2 | null) => void): void };
  /** True while something else owns the screen (an activity): the marker steps aside. */
  busy(): boolean;
}

/**
 * Build the marker, add it to the scene and drive it from the HUD's frame, so it can never point at a
 * different place from the compass diamond, and it holds still with the HUD during a conversation.
 */
export function mountGoalMarker(d: GoalMarkerDeps): GoalMarker {
  const marker = createGoalMarker(d.sampler);
  const side = createGoalMarker(d.sampler, SIDE_LOOK);
  d.scene.add(marker.object, side.object);
  let last = performance.now();
  d.hud.onFrame((target, from, held, errand) => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const show = !held && !d.busy();
    marker.update(dt, target, from, d.camera, show);
    side.update(dt, errand, from, d.camera, show, !marker.arrowShown);
  });
  return marker;
}

export function createGoalMarker(sampler: TerrainSampler, look: MarkerLook = GOAL_LOOK): GoalMarker {
  const group = new THREE.Group();
  group.name = 'goal-marker';
  group.visible = false;

  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTexture(), transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const beamGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.layers.set(AURORA_LAYER);
  beam.frustumCulled = false;
  beam.renderOrder = 3;

  const gemMat = new THREE.MeshLambertMaterial({
    color: look.gem, emissive: new THREE.Color(look.glow), emissiveIntensity: 0.55,
    flatShading: true, fog: false, transparent: true,
  });
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), gemMat);
  gem.frustumCulled = false;
  group.add(beam, gem);

  const arrowMat = new THREE.MeshBasicMaterial({ color: look.gem, fog: false, transparent: true, side: THREE.DoubleSide });
  const arrow = new THREE.Mesh(floorArrow(), arrowMat);
  arrow.frustumCulled = false;
  arrow.visible = false;
  const arrowRoot = new THREE.Group();
  arrowRoot.name = 'goal-arrow';
  arrowRoot.add(arrow);
  const look2 = new THREE.Vector3();

  let time = 0;
  const at = new THREE.Vector3();
  const cam = new THREE.Vector3();

  const root = new THREE.Group();
  root.add(group, arrowRoot);

  /** The arrow by Pip, when the goal is close and out of view. */
  const pointArrow = (target: Vec2 | null, from: Vec3, camera: THREE.Camera, show: boolean, near: number): void => {
    arrow.visible = false;
    if (!look.arrow || !target || !show || near > ARROW_FAR || near < ARROW_NEAR) return;
    camera.getWorldDirection(look2);
    const viewYaw = Math.atan2(look2.x, look2.z);
    const toYaw = Math.atan2(target.x - from.x, target.z - from.z);
    const off = Math.abs(Math.atan2(Math.sin(toYaw - viewYaw), Math.cos(toYaw - viewYaw)));
    if (off < ARROW_OFF) return;
    const x = from.x + Math.sin(toYaw) * ARROW_OUT, z = from.z + Math.cos(toYaw) * ARROW_OUT;
    arrow.position.set(x, groundHeightAt(sampler, x, z) + 0.12, z);
    arrow.rotation.set(0, toYaw, 0);
    const still = document.documentElement.dataset.reduceMotion === 'on';
    arrow.scale.setScalar(ARROW_SIZE * (still ? 1 : 1 + 0.12 * Math.sin(performance.now() / 180)));
    arrowMat.opacity = Math.min(1, (off - ARROW_OFF) / 0.3);
    arrow.visible = true;
  };

  return {
    object: root,
    get arrowShown(): boolean {
      return arrow.visible;
    },
    update(dt, target, from, camera, show, arrowOk = true): void {
      const near = target ? Math.hypot(target.x - from.x, target.z - from.z) : 0;
      pointArrow(target, from, camera, show && arrowOk, near);
      // Gone only once the E pill is up (a villager's reach is 5.5 u): critic round 51 stood a few units
      // from Hollis with neither.
      const gemFade = smooth(3.5, 5, near);
      if (!target || !show || gemFade <= 0) {
        group.visible = false;
        return;
      }
      const reduced = document.documentElement.dataset.reduceMotion === 'on';
      time += dt;
      const ground = groundHeightAt(sampler, target.x, target.z);
      at.set(target.x, ground, target.z);
      camera.getWorldPosition(cam);
      // Past the draw limit, slide the whole marker toward the camera along the same sight line.
      const far = at.distanceTo(cam);
      const k = far > DRAW_LIMIT ? DRAW_LIMIT / far : 1;
      at.sub(cam).multiplyScalar(k).add(cam);
      const px = Math.max(1, at.distanceTo(cam)) * PX_PER_UNIT;

      // Far off, the gem rides the top of the column, clear of trees and ridges; walking in, it slides
      // down the column to sit over the target's head.
      const beamFade = smooth(16, 32, near);
      const tall = px * look.beamPx + LIFT * k;
      const bob = reduced ? 0 : Math.sin(time * 2.2) * px * 1.2;
      const half = Math.max(0.3, px * look.gemPx);
      const lift = LIFT * k + (tall - LIFT * k) * beamFade;
      gem.position.set(at.x, at.y + lift + half + bob, at.z);
      gem.scale.set(half * 0.7, half, half * 0.7);
      if (!reduced) gem.rotation.y += dt * 1.6;
      gemMat.opacity = gemFade;

      beam.visible = beamFade > 0;
      beam.position.copy(at);
      beam.scale.set(Math.max(0.35, px * 3), tall, 1);
      beam.rotation.y = Math.atan2(cam.x - at.x, cam.z - at.z);
      beamMat.opacity = beamFade * look.beamAlpha;
      group.visible = true;
    },
  };
}
