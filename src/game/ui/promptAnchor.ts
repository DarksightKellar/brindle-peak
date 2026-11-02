/**
 * Where the interact prompt stands on screen: over the thing E will reach, not under Pip.
 *
 * The prompt used to sit at a fixed spot under the bird's feet, so with Bram and his woodpile both in
 * reach, or two villagers side by side, nothing said which one the press would go to. Now it is pinned
 * above the target's head (a villager's real body top, measured once) or above the prop's spot, and
 * follows it as the camera moves. Returns null when the point is behind the camera; the HUD then
 * falls back to the old place under Pip.
 */

import * as THREE from 'three';
import type { Interactable } from '../../core/contracts';

/** Clearance over a villager's head, in world units. */
const OVER_HEAD = 0.45;
/** Height of the prompt over a prop or post that has no measured body. */
const PROP_TOP: Readonly<Record<string, number>> = { activity: 1.5, lantern: 2.4, pickup: 0.8 };
/** Keep the pill this far inside the window, in CSS pixels. */
const EDGE = 48;

export type PromptAnchor = (target: Interactable) => { x: number; y: number } | null;

export function createPromptAnchor(
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  bodies: ReadonlyMap<string, THREE.Object3D>,
): PromptAnchor {
  const tops = new Map<string, number>();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();

  const topOf = (t: Interactable): number => {
    const body = t.kind === 'npc' ? bodies.get(t.id) : undefined;
    if (!body) return t.pos.y + (PROP_TOP[t.kind] ?? 1.5);
    let top = tops.get(t.id);
    if (top === undefined) {
      top = box.setFromObject(body).max.y;
      tops.set(t.id, top);
    }
    return top + OVER_HEAD;
  };

  return (t) => {
    // The rig has just moved the camera this frame; the renderer would only refresh this on draw.
    camera.updateMatrixWorld();
    v.set(t.pos.x, topOf(t), t.pos.z).project(camera);
    if (v.z > 1) return null;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    return {
      x: Math.round(Math.min(w - EDGE, Math.max(EDGE, (v.x * 0.5 + 0.5) * w))),
      y: Math.round(Math.min(h - EDGE, Math.max(EDGE, (-v.y * 0.5 + 0.5) * h))),
    };
  };
}
