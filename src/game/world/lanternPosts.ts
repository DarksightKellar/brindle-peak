/**
 * Nana's trail posts: twelve lantern posts from the cabin to the summit.
 *
 * They used to be a dark ball the size of a bell, 0.6 u off the snow, so the posts Nana sends you up
 * the mountain to light were never seen on the climb. A post is now a post: a tall timber upright
 * with a snow cap, a crossarm, and a lamp box hanging from it. Unlit, the glass is dark iron. Lit,
 * it glows, a soft halo carries it through the haze for a long way, and a pool of lamplight lies on
 * the snow under it — the same warm-on-blue as the cabin windows, so a lit post reads as someone
 * having passed this way.
 *
 * `setLit` is how assemble.ts lights one; the `orb` name is kept so any caller looking it up still
 * finds the glass.
 */

import * as THREE from 'three';
import type { TerrainSampler } from '../../core/contracts';
import { PALETTE } from '../../core/palette';
import { CAMERA } from '../render/pixelConfig';
import { GeoBuilder } from './geoBuilder';
import { groundHeightAt } from './groundHeight';
import { haloSprite } from './halo';
import { installViewFade } from '../render/viewFade';

const POOL_RADIUS = 3.6;
const POOL_RIM = 16;
const LAMP_Y = 2.55;
/** A lit post's far-off point of light, in internal pixels (of the 216-high frame). */
const GLINT_PX = 8;
/** World units per internal pixel, per unit of distance (goalMarker.ts does the same). */
const PX_PER_UNIT = (2 * Math.tan(((CAMERA.fov / 2) * Math.PI) / 180)) / 216;

/** Unlit and out of the normal pass, like every glowing thing (ART_BIBLE A3). */
function glowMaterial(hex: string, opacity = 1, additive = false): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex),
    transparent: opacity < 1 || additive,
    opacity,
    depthWrite: !additive,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  m.allowOverride = false;
  return m;
}

const LIT = glowMaterial(PALETTE.LANTERN);
const DARK = glowMaterial(PALETTE.ROCK_DK);
// The glass is cut with the timber when the post stands between the camera and Pip (render/viewFade):
// left drawn, a lit lamp hung in the air beside the bird with no post under it (critic 3, frame 20).
installViewFade(LIT);
installViewFade(DARK);

/** The timber: post, cap, crossarm and the lamp's housing. Faces local +x. */
function post(): THREE.Mesh {
  const b = new GeoBuilder();
  b.cyl(0, -0.15, 0, 0.13, 3.1, 'WOOD_DK');
  b.box(0, 2.95, 0, 0.36, 0.14, 0.36, 'WOOD_MID', 'SNOW_LT');
  b.box(0, 3.08, 0, 0.32, 0.12, 0.32, 'SNOW_HI');
  b.strut([0, 2.85, 0], [0.75, 2.85, 0], 0.07, 'WOOD_DK');
  b.strut([0, 2.35, 0], [0.42, 2.82, 0], 0.05, 'WOOD_DK');
  // Housing: a little roof and a base plate either side of the glass.
  b.box(0.75, 2.79, 0, 0.44, 0.1, 0.44, 'ROCK_DK', 'SNOW_LT');
  b.box(0.75, 2.2, 0, 0.38, 0.08, 0.38, 'ROCK_DK');
  return b.finish('lantern-post');
}

/** The lamplight on the snow: a fan whose rim follows the drawn ground, additive, hidden until lit. */
function pool(sampler: TerrainSampler, x: number, z: number, baseY: number, ox: number, oz: number): THREE.Mesh {
  const lamp = new THREE.Color(PALETTE.LANTERN);
  const pos: number[] = [];
  const col: number[] = [];
  const put = (dx: number, dz: number, a: number): void => {
    pos.push(dx, groundHeightAt(sampler, x + dx, z + dz) + 0.06 - baseY, dz);
    col.push(lamp.r * a, lamp.g * a, lamp.b * a);
  };
  for (let k = 0; k < POOL_RIM; k++) {
    const a0 = (k / POOL_RIM) * Math.PI * 2;
    const a1 = ((k + 1) / POOL_RIM) * Math.PI * 2;
    put(ox, oz, 0.42);
    put(ox + Math.cos(a1) * POOL_RADIUS, oz + Math.sin(a1) * POOL_RADIUS, 0);
    put(ox + Math.cos(a0) * POOL_RADIUS, oz + Math.sin(a0) * POOL_RADIUS, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.allowOverride = false;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'pool';
  mesh.renderOrder = 1;
  mesh.visible = false;
  return mesh;
}

/**
 * A lit post seen from far off. The halo shrinks to nothing with distance, so a lit post also carries
 * a point of light a few pixels across at any range; past the far plane it is drawn on that plane
 * rather than clipped. From the summit the lit posts read as a string of lamps going down the
 * mountain, and from the ridge foot the line runs on to the cabin. Hills nearer than the far plane
 * still hide it: it is depth-tested like anything else.
 */
function glintSprite(): THREE.Sprite {
  const glint = haloSprite(PALETTE.LANTERN, GLINT_PX * PX_PER_UNIT, 0.95);
  glint.material.sizeAttenuation = false;
  glint.material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <logdepthbuf_vertex>',
      'gl_Position.z = min(gl_Position.z, gl_Position.w * 0.9999);\n#include <logdepthbuf_vertex>',
    );
  };
  glint.frustumCulled = false;
  glint.name = 'glint';
  return glint;
}

/**
 * One post at (x, z), standing on the terrain, its arm reaching toward `toward` (the next post up the
 * trail), so every lamp leans the way you are walking.
 */
export function buildLanternPost(sampler: TerrainSampler, x: number, z: number, toward: { x: number; z: number }): THREE.Group {
  const root = new THREE.Group();
  const y = sampler.heightAt(x, z);
  root.position.set(x, y, z);
  // Local +x is the arm; under a Y turn of `yaw` it points along (cos, -sin), toward the next post.
  const yaw = Math.atan2(-(toward.z - z), toward.x - x);
  const frame = new THREE.Group();
  frame.rotation.y = yaw;
  root.add(frame);
  frame.add(post());

  const glass = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), DARK);
  glass.scale.set(0.22, 0.32, 0.22);
  glass.position.set(0.75, LAMP_Y, 0);
  glass.name = 'orb';
  frame.add(glass);

  const glowSprite = haloSprite(PALETTE.LANTERN, 2.8, 0.55);
  glowSprite.position.set(0.75, LAMP_Y, 0);
  glowSprite.visible = false;
  frame.add(glowSprite);

  const glint = glintSprite();
  glint.position.set(0.75, LAMP_Y, 0);
  glint.visible = false;
  frame.add(glint);

  // The pool hangs off the root, not the turned frame, so its rim can follow the ground; centre it
  // under the lamp, which the frame's yaw has carried to (cos, -sin) * arm.
  root.add(pool(sampler, x, z, y, Math.cos(yaw) * 0.75, -Math.sin(yaw) * 0.75));
  return root;
}

/**
 * Seconds a newly lit post flares: its halo swells to several times its size and settles. Critic round 65
 * walked past posts with the lantern and never saw one light; in daylight the lamp just switched on.
 */
const FLARE = 0.9;
const FLARE_SWELL = 2.6;
const flaring: { halo: THREE.Sprite; t: number }[] = [];

/** Light a post: the glass glows, the halo, the far glint and the pool on the snow appear. */
export function setPostLit(root: THREE.Object3D, flare = false): void {
  const glass = root.getObjectByName('orb');
  if (glass instanceof THREE.Mesh) glass.material = LIT;
  for (const name of ['halo', 'glint', 'pool']) {
    const o = root.getObjectByName(name);
    if (o) o.visible = true;
  }
  const halo = root.getObjectByName('halo');
  const still = typeof document !== 'undefined' && document.documentElement.dataset.reduceMotion === 'on';
  if (flare && !still && halo instanceof THREE.Sprite) {
    halo.userData.size ??= halo.scale.x;
    halo.userData.opacity ??= halo.material.opacity;
    flaring.push({ halo, t: 0 });
  }
}

/** Run each flare down to the steady glow. */
export function updatePostFlares(dt: number): void {
  for (let i = flaring.length - 1; i >= 0; i--) {
    const f = flaring[i];
    f.t += dt;
    const k = Math.min(1, f.t / FLARE);
    const left = (1 - k) * (1 - k);
    f.halo.scale.setScalar((f.halo.userData.size as number) * (1 + FLARE_SWELL * left));
    f.halo.material.opacity = Math.min(1, (f.halo.userData.opacity as number) + 0.4 * left);
    if (k >= 1) flaring.splice(i, 1);
  }
}
