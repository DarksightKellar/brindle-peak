/**
 * Things to do, marked in the world while they are near and not yet done: a small aurora-green gem
 * turning over each activity's start, the colour the map's activity glyphs share.
 *
 * Critic round 5 climbed Windscar Ridge past the kite and the chimney race, looked for both, and found
 * neither: the trail's switchbacks pass them 35 to 40 units off, and in the ridge's snow a start post
 * that far away is a grey fleck. The map drew their glyphs; nothing in the world said "here".
 *
 * Quieter than the story's gem and the errand's (goalMarker.ts): no column of light, green rather than
 * lantern or amber, a smaller size on screen, shown only inside SEEN units and gone inside the E pill's
 * reach. Once an activity has been done its gem never comes back; the map keeps its glyph for a rerun.
 * It draws over the hill in front of it, as a mark on the skyline would: the point is "over there".
 * Sized in screen pixels like the goal gem, so it reads the same at 20 units and at 90.
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
/** The gem's half-height in internal pixels (the story's is 3.5, the errand's 2.5). */
const GEM_PX = 2.5;
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
  const gems = activities.map((a) => {
    const mat = new THREE.MeshLambertMaterial({
      color: PALETTE.AURORA_G, emissive: new THREE.Color(PALETTE.AURORA_G), emissiveIntensity: 0.5,
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
    return { def: a, mesh, mat, ground: groundHeightAt(sampler, a.pos.x, a.pos.z), phase: a.pos.x * 0.37 };
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
