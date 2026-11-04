/**
 * Things to do, marked in the world while they are near and not yet done: a small aurora-green gem
 * turning over each activity's start, the colour the map's activity glyphs share.
 *
 * Critic round 5 climbed Windscar Ridge past the kite and the chimney race, looked for both, and found
 * neither: the trail's switchbacks pass them 35 to 40 units off, and in the ridge's snow a start post
 * that far away is a grey fleck. The map drew their glyphs; nothing in the world said "here".
 *
 * Quieter than the story's gem and the errand's (goalMarker.ts): no column of light, green rather than
 * lantern or amber, shown only inside SEEN units and gone inside the E pill's
 * reach. Once an activity has been done its gem never comes back; the map keeps its glyph for a rerun.
 * It draws over the hill in front of it, as a mark on the skyline would: the point is "over there".
 * Sized in screen pixels like the goal gem, so it reads the same at 20 units and at 90.
 *
 * Round 8's critic then lost the spot itself: the gem goes inside NEAR, the E pill comes only within
 * the activity's reach, and between the two there was bare snow (the aurora photo spot worst of all).
 * So inside RING_SEEN the gem lands as a green ring on the snow where Pip stands to play.
 */

import * as THREE from 'three';
import type { ActivityDef, GameState, TerrainSampler, Vec3 } from '../../core/contracts';
import { PALETTE } from '../../core/palette';
import { CAMERA } from '../render/pixelConfig';
import { groundHeightAt } from './groundHeight';

/** Shown within this many units of Pip; faded in over the last FADE of it. */
const SEEN = 90;
const FADE = 20;
/** Gone inside this: the activity's own E pill is up. */
const NEAR = 6;
/**
 * The gem's half-height in internal pixels (the story's is 3.5, the errand's 2.5). At 2.5 it was a
 * few pixels and missed; the director chose this size from a side-by-side. The story's gem still
 * leads: it alone stands on a column of light.
 */
const GEM_PX = 4.25;
/** The ring on the snow: shown within this, and its radius. */
const RING_SEEN = 16;
const RING_R = 1.3;
/** Above the start's ground, clear of a start post and a villager's head. */
const LIFT = 2.8;
const PX_PER_UNIT = (2 * Math.tan(((CAMERA.fov / 2) * Math.PI) / 180)) / 216;

export interface ActivityGems {
  object: THREE.Object3D;
  /** `show` false hides them all: a conversation, a panel or an activity owns the screen. */
  update(dt: number, state: GameState, from: Vec3, camera: THREE.Camera, show: boolean): void;
}

export function createActivityGems(sampler: TerrainSampler, activities: readonly ActivityDef[]): ActivityGems {
  const group = new THREE.Group();
  group.name = 'activity-gems';
  const geo = new THREE.OctahedronGeometry(1, 0);
  // Green on a dark rim: a thin pale ring alone was lost on sunlit snow seen almost edge-on.
  const ringGeo = new THREE.TorusGeometry(RING_R, 0.13, 4, 32).rotateX(Math.PI / 2);
  const rimGeo = new THREE.TorusGeometry(RING_R, 0.18, 4, 32).rotateX(Math.PI / 2);
  const gems = activities.map((a) => {
    const mat = new THREE.MeshLambertMaterial({
      color: PALETTE.AURORA_G, emissive: new THREE.Color(PALETTE.AURORA_G), emissiveIntensity: 1,
      flatShading: true, fog: false, transparent: true,
      // Drawn over the ground in front of it: the kite and the chimney race stand on the ridge's top,
      // above the trail's sight line, and a gem the hill hides says nothing.
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    group.add(mesh);
    const ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.AURORA_G, transparent: true, fog: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    const rimMat = new THREE.MeshBasicMaterial({ color: PALETTE.PINE_DK, transparent: true, fog: false });
    ring.add(new THREE.Mesh(rimGeo, rimMat).translateY(-0.1));
    // Level, and as high as the snow under its rim, so a slope does not bury half of it.
    let top = groundHeightAt(sampler, a.pos.x, a.pos.z);
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2;
      top = Math.max(top, groundHeightAt(sampler, a.pos.x + Math.sin(t) * RING_R, a.pos.z + Math.cos(t) * RING_R));
    }
    ring.position.set(a.pos.x, top + 0.08, a.pos.z);
    ring.visible = false;
    group.add(ring);
    return { def: a, mesh, mat, ring, ringMat, rimMat, ground: groundHeightAt(sampler, a.pos.x, a.pos.z), phase: a.pos.x * 0.37 };
  });
  let time = 0;
  const cam = new THREE.Vector3();
  const at = new THREE.Vector3();

  return {
    object: group,
    update(dt, state, from, camera, show): void {
      const reduced = document.documentElement.dataset.reduceMotion === 'on';
      time += dt;
      camera.getWorldPosition(cam);
      for (const g of gems) {
        const d = Math.hypot(g.def.pos.x - from.x, g.def.pos.z - from.z);
        const done = (state.counters[`activity:${g.def.id}`] ?? 0) > 0;
        g.ring.visible = show && !done && d < RING_SEEN;
        if (g.ring.visible) {
          const fade = Math.min(1, (RING_SEEN - d) / 4);
          g.ringMat.opacity = fade * (reduced ? 0.95 : 0.8 + 0.2 * Math.sin(time * 3 + g.phase));
          g.rimMat.opacity = fade * 0.85;
        }
        if (!show || done || d > SEEN || d < NEAR) {
          g.mesh.visible = false;
          continue;
        }
        at.set(g.def.pos.x, g.ground + LIFT, g.def.pos.z);
        const half = Math.max(0.2, at.distanceTo(cam) * PX_PER_UNIT * GEM_PX);
        const bob = reduced ? 0 : Math.sin(time * 2 + g.phase) * half * 0.5;
        g.mesh.position.set(at.x, at.y + half + bob, at.z);
        g.mesh.scale.set(half * 0.7, half, half * 0.7);
        if (!reduced) g.mesh.rotation.y += dt * 1.2;
        g.mat.opacity = Math.min(1, (SEEN - d) / FADE, (d - NEAR) / 2);
        g.mesh.visible = true;
      }
    },
  };
}
