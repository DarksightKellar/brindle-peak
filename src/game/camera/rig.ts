/**
 * Chase camera. FOV 38, 15 u back, 13° pitch (ART_BIBLE §1, §8; the pitch note is below).
 *
 * Which way it looks is heading.ts: a leash on Pip's movement, the slow turn round behind a walk, Q
 * and R by hand, an activity's aim and the settle toward the next goal after a conversation.
 *
 * It stands a little over Pip's right shoulder (SHOULDER) and a little higher than it looks (LIFT).
 * Straight behind and level, the bird sat exactly on the line to whatever it walked toward, so Bram and
 * Fen were hidden behind Pip just as they mattered. Raised, the bird sits below the middle of the frame
 * and what lies ahead shows over its head; off the shoulder, a little to its right. Compared from the
 * same spots against a wider shoulder alone (Pip pushed to the edge, Bram still behind it) and the lift
 * alone (good, but a villager straight ahead still touched Pip's head), the two together read best.
 *
 * On top of the chase sit two eased shots that borrow the camera without disturbing it underneath:
 * the conversation two-shot (`setFocus`, see shot.ts) and the photo viewfinder (`setAim`). Leaving
 * either eases back to exactly where the chase camera would be now.
 *
 * The ground shapes the shot (groundFrame.ts): on steep ground the camera stands where the skyline
 * stays in frame, and ground or a building behind (structures.ts) raises it over instead of pulling
 * it into the bird. The mast is swung round, not risen over (pillar.ts). Faces that cover Pip are not
 * drawn, and a tree or the mast the lens stands in goes whole (render/viewFade.ts, lensClear.ts). A
 * staged shot (stage.ts) sets its own height and look.
 */

import * as THREE from 'three';
import type { PlayerState, TerrainSampler } from '../../core/contracts';
import type { SceneKit } from '../render/scene';
import { clearFraction, type Occluder } from './occlusion';
import { createHeading } from './heading';
import { createLensClear } from './lensClear';
import { aroundPillar, mastPillar, RADIUS, type Pillar } from './pillar';
import { shortestTurn, twoShot, type Shot, type Speaker } from './shot';
import type { Stage } from './stage';
import { createGroundFrame } from './groundFrame';
import { MAX_OFF } from './terrainFrame';
import { withStructures, type Ground, type Structure } from './structures';

export interface CameraRig {
  /**
   * @param look manual turn axis, -1..1, +1 turns the view right.
   * @param reduced the reduce-motion setting: every ease below snaps instead.
   */
  update(dt: number, target: PlayerState, terrain: TerrainSampler, look: number, reduced?: boolean): void;
  /** The chase heading: the basis movement is measured in. */
  yaw(): number;
  /** The conversation two-shot's heading while one is framed, else null (staging.ts turns the pair to it). */
  shotYaw(): number | null;
  forcePullBack(): void;
  /** Is a trunk or boulder between the camera and Pip right now? Measured when asked, not per frame. */
  occluded(): boolean;
  /** Trunks and boulders, for `occluded()`. Positions are static. */
  setOccluders(occluders: readonly Occluder[]): void;
  /** Buildings the camera rises over. Static. */
  setStructures(list: readonly Structure[]): void;
  /** Viewfinder: look from Pip's head along this aim instead of following, or null to follow again. */
  setAim(aim: ViewAim | null): void;
  /** 0 = chase camera, 1 = fully in the viewfinder; eased. */
  viewBlend(): number;
  /** Conversation: frame Pip and this point (the speaker's feet) together, or null to follow again. */
  setFocus(point: Speaker | null): void;
  /** A composed shot that outranks the two-shot (the radio finale, the homecoming), or null. Call each frame. */
  setStage(shot: Stage | null): void;
  /** Swing the chase heading toward this yaw on the next update (a throw's aim). Call each frame. */
  turnToward(yaw: number): void;
  /** Ease the chase heading round to this yaw over a second or so (toward the next goal). Call once. */
  settle(yaw: number): void;
}

export interface ViewAim {
  yaw: number;
  pitch: number;
}

const FOV = 38;
/**
 * Camera elevation. This is coupled to FOV: sky is only visible while PITCH < FOV/2, because the
 * view axis is PITCH below horizontal and the frame's top edge is half a vertical FOV above it.
 * At 35 deg with a 38 deg FOV the top edge sits 16 deg BELOW the horizon, so the sky dome can
 * never enter frame. 13 deg leaves roughly the top fifth of the frame as sky.
 */
const PITCH = (13 * Math.PI) / 180;
const BASE_DIST = 15;
const PULL_DIST = 24;
const PULL_TIME = 1.4;
const PIVOT_UP = 1.35;
const CLEARANCE = 0.8;
/** Over the right shoulder: the camera and its aim both stand this far to the right of the chase line. */
const SHOULDER = 1.1;
/** The chase camera stands this much higher than PITCH but still looks along PITCH, so Pip sits below
 *  the middle of the frame and what Pip walks toward shows above the bird's head. */
const LIFT = (7 * Math.PI) / 180;
/** Into and out of a staged shot: slower than a conversation, it is a scene change. */
const STAGE_EASE = 1.6;
/** Into and out of the conversation two-shot. */
const SHOT_EASE = 0.6;
/** The swing round the mast eases over this. */
const SWING_TAU = 0.35;
/** Viewfinder eye above Pip's feet (= activities/photo.ts PHOTO.eyeHeight), and its ease. */
const VIEW_EYE = 1.0;
const VIEW_EASE = 0.3;

const ease = (t: number): number => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/** A 0..1 weight that walks toward its goal over `time` seconds, or jumps there when `snap`. */
const toward = (w: number, on: boolean, step: number, time: number, snap: boolean): number =>
  snap ? (on ? 1 : 0) : Math.min(1, Math.max(0, w + (on ? step : -step) / time));

export function createCameraRig(kit: SceneKit): CameraRig {
  const look = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const heading = createHeading();
  const lens = createLensClear();
  let dist = BASE_DIST;
  let pull = -1;
  let occluders: readonly Occluder[] = [];
  let aim: ViewAim | null = null;
  let lastAim: ViewAim = { yaw: 0, pitch: 0 };
  let blend = 0;
  let focus: Speaker | null = null;
  let shot: Shot | null = null;
  let shotStale = false;
  let shotBlend = 0;
  let stage: Stage | null = null;
  let lastStage: Stage | null = null;
  let stageBlend = 0;
  let jumped = true;
  let swing = 0;
  const ground = createGroundFrame();
  let structures: readonly Structure[] = [];
  let solid: { of: TerrainSampler; ground: Ground; mast: Pillar } | null = null;
  const followPos = new THREE.Vector3();
  const followQuat = new THREE.Quaternion();
  const aimQuat = new THREE.Quaternion();

  kit.camera.fov = FOV;
  kit.camera.updateProjectionMatrix();

  const update = (
    dt: number, target: PlayerState, terrain: TerrainSampler, lookAxis: number, reduced = false,
  ): void => {
    const step = Math.min(Math.max(dt, 0), 0.1);
    const { x: px, z: pz } = target.pos;
    // Held still while the viewfinder owns the view: A and D turn that instead.
    if (heading.update(step, target.pos, target.facing, dist, lookAxis, aim !== null, reduced)) jumped = true;
    const yaw = heading.yaw();
    if (solid?.of !== terrain) solid = { of: terrain, ground: withStructures(terrain, structures), mast: mastPillar(terrain) };

    if (pull >= 0) {
      pull += step;
      const t = pull / PULL_TIME;
      const swingOut = t < 1 ? ease(t) : 1 - ease(t - 1);
      if (pull >= PULL_TIME * 2) pull = -1;
      dist += (BASE_DIST + (PULL_DIST - BASE_DIST) * swingOut - dist) * (1 - Math.exp(-step / 0.2));
    } else {
      dist += (BASE_DIST - dist) * (1 - Math.exp(-step / 0.35));
    }

    // The two-shot is measured once per conversation, from where Pip stands when it starts (on the
    // ground: a conversation opened mid-hop must not frame the pair from a hop's height).
    if (focus && shotStale) {
      const py = Math.min(target.pos.y, terrain.heightAt(px, pz) + 0.6);
      shot = twoShot({ x: px, y: py, z: pz }, focus, yaw, { solid: solid.ground, pillar: { ...solid.mast, radius: RADIUS } });
      shotStale = false;
    }
    shotBlend = toward(shotBlend, focus !== null, step, SHOT_EASE, reduced);
    const s = shot ? ease(shotBlend) : 0;
    let viewYaw = shot ? yaw + shortestTurn(yaw, shot.yaw) * s : yaw;
    pivot.set(px, target.pos.y + PIVOT_UP, pz);
    if (shot) pivot.lerp(look.set(shot.pivot.x, shot.pivot.y, shot.pivot.z), s);
    let span = shot ? dist + (shot.dist - dist) * s : dist;
    // A staged shot sits over all of that, and leaves back to it.
    if (stage) lastStage = stage;
    stageBlend = toward(stageBlend, stage !== null, step, STAGE_EASE, reduced);
    const g = lastStage ? ease(stageBlend) : 0;
    if (lastStage && g > 0) {
      viewYaw += shortestTurn(viewYaw, lastStage.yaw) * g;
      pivot.lerp(look.set(lastStage.pivot.x, lastStage.pivot.y, lastStage.pivot.z), g);
      span += (lastStage.dist - span) * g;
    }
    const staged = lastStage && g > 0 ? { elev: lastStage.elev, look: lastStage.look, weight: g } : null;
    // The lift and the shoulder belong to the chase alone: a two-shot or a staged shot frames its own pair.
    const chase = (1 - s) * (1 - g);
    const lift = LIFT * chase;
    // Round the mast rather than through it (a two-shot or a staged shot places itself).
    const around = g > 0.5 || s > 0.5 ? 0 : aroundPillar(solid.mast, pivot, viewYaw, span, pivot.y + Math.sin(PITCH + lift) * span, swing);
    swing = reduced || jumped ? around : swing + (around - swing) * (1 - Math.exp(-step / SWING_TAU));
    viewYaw += swing * (1 - g);
    const f = ground.solve({
      terrain, solid: solid.ground, pivot, foot: target.pos, yaw: viewYaw, span, base: PITCH + lift + (shot ? (shot.elev - PITCH) * s : 0), lift, chase,
      stage: staged, step, snap: jumped,
    });
    jumped = false;
    const cp = Math.cos(f.elev);
    const side = SHOULDER * chase;
    const sx = -Math.cos(viewYaw) * side;
    const sz = Math.sin(viewYaw) * side;
    const cx = pivot.x - Math.sin(viewYaw) * cp * f.reach + sx;
    const cz = pivot.z - Math.cos(viewYaw) * cp * f.reach + sz;
    const cy = Math.max(pivot.y + Math.sin(f.elev) * f.reach, solid.ground.heightAt(cx, cz) + CLEARANCE);
    kit.camera.position.set(cx, cy, cz);
    // Look at the pivot's column at the pitch chosen above (no roll: the up vector is never touched).
    look.set(pivot.x + sx, cy - f.reach * cp * Math.tan(Math.max(f.look - lift, f.elev - MAX_OFF)) - 0.25, pivot.z + sz);
    kit.camera.lookAt(look);

    /*
     * The viewfinder rides on top of everything above: the follow state keeps updating underneath, so
     * leaving the viewfinder eases back to exactly where the chase camera would be now.
     */
    blend = toward(blend, aim !== null, step, VIEW_EASE, reduced);
    lens.update(kit.camera.position, occluders, terrain, blend <= 0, step, reduced);
    if (blend <= 0) return;
    const e = ease(blend);
    const a = aim ?? lastAim;
    followPos.copy(kit.camera.position);
    followQuat.copy(kit.camera.quaternion);
    const ey = target.pos.y + VIEW_EYE;
    const c = Math.cos(a.pitch);
    kit.camera.position.set(px, ey, pz);
    kit.camera.lookAt(px + Math.sin(a.yaw) * c, ey + Math.sin(a.pitch), pz + Math.cos(a.yaw) * c);
    aimQuat.copy(kit.camera.quaternion); // slerpQuaternions must not read the quaternion it writes
    kit.camera.quaternion.slerpQuaternions(followQuat, aimQuat, e);
    kit.camera.position.lerpVectors(followPos, look.set(px, ey, pz), e);
  };

  return {
    update,
    yaw: () => heading.yaw(),
    shotYaw: () => (focus && shot ? shot.yaw : null),
    forcePullBack: () => { pull = 0; },
    occluded: () => {
      if (occluders.length === 0) return false;
      const cam = kit.camera.position;
      return clearFraction({ x: pivot.x, y: pivot.y, z: pivot.z }, { x: cam.x, y: cam.y, z: cam.z }, occluders) < 0.999;
    },
    setOccluders: (list) => { occluders = list; },
    setStructures: (list) => {
      structures = list;
      solid = null;
    },
    setAim: (next) => {
      if (next) lastAim = { yaw: next.yaw, pitch: next.pitch };
      aim = next;
    },
    viewBlend: () => blend,
    setStage: (next) => { stage = next; },
    setFocus: (point) => {
      if (point && (!focus || Math.hypot(point.x - focus.x, point.z - focus.z) > 0.5)) shotStale = true;
      focus = point;
    },
    turnToward: (next) => heading.steer(next),
    settle: (next) => heading.settle(next),
  };
}
